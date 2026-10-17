package io.github.drbeefsupreme.posetutor.coach

import android.os.SystemClock
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.transformWhile
import kotlinx.coroutines.launch

private const val TAG = "TutorCoach"
private const val DEFAULT_MODEL_NAME = "gemini-nano"

/**
 * The native side of src/platform/coachPlugin.ts: Gemini Nano through the ML Kit GenAI Prompt API
 * (com.google.mlkit:genai-prompt, https://developers.google.com/ml-kit/genai/prompt/android/get-started).
 * One generate runs at a time; a second one is refused with `busy`, not queued.
 */
@CapacitorPlugin(name = "TutorCoach")
class TutorCoachPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val client = lazy { Generation.getClient() }
    private val model: GenerativeModel get() = client.value
    private val statusMapper by lazy { NanoStatusMapper(context) }
    private val generating = AtomicBoolean(false)
    private var download: Deferred<Unit>? = null

    @Volatile
    private var baseModelName: String? = null

    @PluginMethod
    fun status(call: PluginCall) {
        scope.launch { call.resolve(currentStatus().toJs()) }
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val job = synchronized(this) {
            download?.takeIf { it.isActive } ?: scope.async { downloadModel() }.also { download = it }
        }
        scope.launch {
            try {
                job.await()
                call.resolve()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                reject(call, e)
            }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val startedAt = SystemClock.elapsedRealtime()
        val prompt = call.getString("prompt")
        if (prompt.isNullOrBlank()) {
            call.reject("generate needs a prompt")
            return
        }
        if (!generating.compareAndSet(false, true)) {
            call.reject("Another generate is running. Wait for it to finish.", CoachError.BUSY.code)
            return
        }
        val imageDataUrl = call.getString("imageDataUrl")
        val temperature = call.getFloat("temperature")
        val maxOutputTokens = call.getInt("maxOutputTokens")
        scope.launch {
            try {
                val text = generateText(prompt, imageDataUrl, temperature, maxOutputTokens)
                call.resolve(
                    JSObject().apply {
                        put("text", text)
                        put("ms", SystemClock.elapsedRealtime() - startedAt)
                        put("model", modelName())
                    },
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                reject(call, e)
            } finally {
                generating.set(false)
            }
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
        if (client.isInitialized()) client.value.close()
    }

    private suspend fun currentStatus(): NanoStatus = try {
        statusMapper.map(model.checkStatus())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Log.w(TAG, "checkStatus failed: ${describe(e)}")
        statusMapper.map(e)
    }

    private suspend fun downloadModel() {
        when (val status = currentStatus()) {
            NanoStatus.Available -> return
            is NanoStatus.Unavailable -> throw CoachFailure(CoachError.UNAVAILABLE, status.reason)
            NanoStatus.Downloadable, NanoStatus.Downloading -> Unit
        }
        var totalBytes: Long? = null
        var completed = false
        model.download()
            .transformWhile { emit(it); it != DownloadStatus.DownloadCompleted && it !is DownloadStatus.DownloadFailed }
            .collect { step ->
                when (step) {
                    is DownloadStatus.DownloadStarted -> {
                        totalBytes = step.bytesToDownload.takeIf { it > 0 }
                        notifyProgress(0, totalBytes)
                    }
                    is DownloadStatus.DownloadProgress -> notifyProgress(step.totalBytesDownloaded, totalBytes)
                    is DownloadStatus.DownloadFailed -> throw step.e
                    DownloadStatus.DownloadCompleted -> completed = true
                }
            }
        if (!completed) throw CoachFailure(CoachError.FAILED, "The Gemini Nano download stopped before it completed.")
    }

    private fun notifyProgress(downloadedBytes: Long, totalBytes: Long?) {
        notifyListeners(
            "downloadProgress",
            JSObject().apply {
                put("downloadedBytes", downloadedBytes)
                if (totalBytes != null) put("totalBytes", totalBytes)
            },
        )
    }

    private suspend fun generateText(prompt: String, imageDataUrl: String?, temperature: Float?, maxOutputTokens: Int?): String {
        val image = imageDataUrl?.let { url ->
            ImagePart(decodeCoachImage(url).also { Log.d(TAG, "image decoded to ${it.width}x${it.height}") })
        }
        when (val status = currentStatus()) {
            NanoStatus.Available -> Unit
            is NanoStatus.Unavailable -> throw CoachFailure(CoachError.UNAVAILABLE, status.reason)
            NanoStatus.Downloadable, NanoStatus.Downloading ->
                throw CoachFailure(CoachError.UNAVAILABLE, "Gemini Nano is not downloaded yet. Download it in Settings first.")
        }
        val options: GenerateContentRequest.Builder.() -> Unit = {
            this.temperature = temperature
            this.maxOutputTokens = maxOutputTokens
        }
        val request = if (image == null) {
            generateContentRequest(TextPart(prompt), options)
        } else {
            generateContentRequest(image, TextPart(prompt), options)
        }
        val response = model.generateContent(request)
        return response.candidates.firstOrNull()?.text
            ?: throw CoachFailure(CoachError.FAILED, "Gemini Nano returned no text.")
    }

    private suspend fun modelName(): String {
        baseModelName?.let { return it }
        val name = try {
            model.getBaseModelName().takeIf { it.isNotBlank() }
        } catch (e: GenAiException) {
            Log.w(TAG, "getBaseModelName failed", e)
            null
        }
        if (name != null) baseModelName = name
        return name ?: DEFAULT_MODEL_NAME
    }

    private fun reject(call: PluginCall, e: Exception) {
        val failure = when (e) {
            is CoachFailure -> e
            is GenAiException -> e.toFailure()
            is BadImageException -> CoachFailure(CoachError.BAD_IMAGE, e.message ?: "bad image", e)
            else -> CoachFailure(CoachError.FAILED, describe(e), e)
        }
        if (failure.error == CoachError.FAILED) Log.w(TAG, "coach call failed", e)
        call.reject(failure.message, failure.error.code)
    }
}
