package io.github.drbeefsupreme.posetutor.coach

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import com.getcapacitor.JSObject
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException

private const val AICORE_PACKAGE = "com.google.android.aicore"

/** The `NanoStatusResult` of coachPlugin.ts. */
internal sealed class NanoStatus(private val label: String) {
    data object Available : NanoStatus("available")
    data object Downloadable : NanoStatus("downloadable")
    data object Downloading : NanoStatus("downloading")
    data class Unavailable(val reason: String) : NanoStatus("unavailable")

    fun toJs(): JSObject = JSObject().apply {
        put("status", label)
        if (this@NanoStatus is Unavailable) put("reason", reason)
    }
}

/** The JS rejection codes of coachPlugin.ts. */
internal enum class CoachError(val code: String) {
    UNAVAILABLE("unavailable"),
    BUSY("busy"),
    BAD_IMAGE("badImage"),
    FAILED("failed"),
}

internal class CoachFailure(val error: CoachError, message: String, cause: Throwable? = null) : Exception(message, cause)

internal fun describe(e: Exception): String = when (e) {
    is GenAiException -> "${e.message ?: "no message"} (ML Kit error ${e.errorCode})"
    else -> e.message ?: e.javaClass.simpleName
}

/** AICore errors that mean this device cannot run Gemini Nano now, as opposed to one call failing. */
private val DEVICE_ERRORS = setOf(
    GenAiException.ErrorCode.NOT_AVAILABLE,
    GenAiException.ErrorCode.NOT_SUPPORTED,
    GenAiException.ErrorCode.AICORE_INCOMPATIBLE,
    GenAiException.ErrorCode.NEEDS_SYSTEM_UPDATE,
)

internal fun GenAiException.toFailure(): CoachFailure = when (errorCode) {
    in DEVICE_ERRORS -> CoachFailure(CoachError.UNAVAILABLE, describe(this), this)
    GenAiException.ErrorCode.INVALID_INPUT_IMAGE -> CoachFailure(CoachError.BAD_IMAGE, describe(this), this)
    else -> CoachFailure(CoachError.FAILED, describe(this), this)
}

internal class NanoStatusMapper(private val context: Context) {
    fun map(featureStatus: Int): NanoStatus = when (featureStatus) {
        FeatureStatus.AVAILABLE -> NanoStatus.Available
        FeatureStatus.DOWNLOADABLE -> NanoStatus.Downloadable
        FeatureStatus.DOWNLOADING -> NanoStatus.Downloading
        FeatureStatus.UNAVAILABLE -> NanoStatus.Unavailable(deviceReason())
        else -> NanoStatus.Unavailable("AICore reported an unknown status ($featureStatus).")
    }

    fun map(failure: Exception): NanoStatus.Unavailable {
        val aicore = aicore()
        return if (aicore != null && aicore.enabled) {
            NanoStatus.Unavailable("AICore failed: ${describe(failure)}")
        } else {
            NanoStatus.Unavailable("${deviceReason()} (ML Kit: ${describe(failure)})")
        }
    }

    private fun deviceReason(): String {
        val aicore = aicore()
        return when {
            aicore == null && isEmulator() -> "This is an emulator. It has no AICore, so Gemini Nano cannot run here."
            aicore == null -> "AICore is not installed on this phone, so Gemini Nano cannot run here."
            !aicore.enabled -> "AICore is turned off on this phone. Turn it on in Settings > Apps > AICore."
            else -> "Gemini Nano is not supported on this phone, or AICore has not finished its setup. " +
                "After a phone setup or an AICore update, the setup can take a few hours on Wi-Fi."
        }
    }

    private fun aicore(): ApplicationInfo? = try {
        val packages = context.packageManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packages.getApplicationInfo(AICORE_PACKAGE, PackageManager.ApplicationInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            packages.getApplicationInfo(AICORE_PACKAGE, 0)
        }
    } catch (e: PackageManager.NameNotFoundException) {
        null
    }

    private fun isEmulator(): Boolean =
        Build.HARDWARE == "ranchu" || Build.HARDWARE == "goldfish" || Build.PRODUCT.startsWith("sdk_")
}
