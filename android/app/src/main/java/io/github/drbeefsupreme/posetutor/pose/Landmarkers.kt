package io.github.drbeefsupreme.posetutor.pose

import android.content.Context
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import org.json.JSONObject

internal const val TAG = "TutorPose"

private const val MODEL = "pose_landmarker_full.task"

/** The `CameraFailure` codes of src/platform/types.ts. */
internal enum class CameraFailure(val code: String) {
    DENIED("denied"),
    NO_DEVICE("noDevice"),
    BUSY("busy"),
    UNSUPPORTED("unsupported"),
}

internal class TrackingUnavailable(cause: Throwable) : Exception("Pose tracking cannot run on this device.", cause)

/**
 * GPU until it fails once, then CPU for the rest of the process. The emulator's GPU delegate builds, then fails at the
 * first detection, so callers report failures here as well as creation errors.
 */
internal class DelegatePolicy {
    @Volatile
    private var gpuFailed = false

    val preferred: Delegate get() = if (gpuFailed) Delegate.CPU else Delegate.GPU

    fun gpuFailed(reason: Throwable) {
        if (!gpuFailed) Log.w(TAG, "GPU delegate failed; using the CPU from now on", reason)
        gpuFailed = true
    }

    fun create(
        context: Context,
        mode: RunningMode,
        configure: (PoseLandmarker.PoseLandmarkerOptions.Builder) -> Unit = {},
    ): Pair<PoseLandmarker, Delegate> {
        if (preferred == Delegate.GPU) {
            try {
                return build(context, Delegate.GPU, mode, configure) to Delegate.GPU
            } catch (e: Exception) {
                gpuFailed(e)
            }
        }
        try {
            return build(context, Delegate.CPU, mode, configure) to Delegate.CPU
        } catch (e: Exception) {
            throw TrackingUnavailable(e)
        }
    }

    private fun build(
        context: Context,
        delegate: Delegate,
        mode: RunningMode,
        configure: (PoseLandmarker.PoseLandmarkerOptions.Builder) -> Unit,
    ): PoseLandmarker {
        val options = PoseLandmarker.PoseLandmarkerOptions.builder()
            .setBaseOptions(BaseOptions.builder().setModelAssetPath(MODEL).setDelegate(delegate).build())
            .setRunningMode(mode)
            .setNumPoses(1)
            .also(configure)
            .build()
        return PoseLandmarker.createFromOptions(context, options)
    }
}

/** The `NativePoseFrame` of src/platform/posePlugin.ts. */
internal fun poseFrame(result: PoseLandmarkerResult, timestampMs: Long, width: Int, height: Int): JSObject {
    val points = result.landmarks().firstOrNull()
    return JSObject().apply {
        put("landmarks", points?.let(::landmarkArray) ?: JSONObject.NULL)
        put("timestampMs", timestampMs)
        put("width", width)
        put("height", height)
    }
}

private fun landmarkArray(points: List<NormalizedLandmark>): JSArray = JSArray().apply {
    for (p in points) {
        put(
            JSObject().apply {
                put("x", p.x().toDouble())
                put("y", p.y().toDouble())
                put("z", p.z().toDouble())
                put("visibility", p.visibility().orElse(0f).toDouble())
            },
        )
    }
}

internal val Delegate.label: String get() = if (this == Delegate.GPU) "GPU" else "CPU"

/** A graph that failed throws the failure again from close() (the emulator's GPU first detection did, and killed the app). */
internal fun PoseLandmarker.closeSafely() {
    try {
        close()
    } catch (e: RuntimeException) {
        Log.w(TAG, "closing a failed landmarker: ${e.message}")
    }
}