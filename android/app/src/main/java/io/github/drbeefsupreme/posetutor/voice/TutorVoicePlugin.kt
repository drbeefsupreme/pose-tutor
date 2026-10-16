package io.github.drbeefsupreme.posetutor.voice

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

private const val MICROPHONE = "microphone"
private const val TAG = "TutorVoice"

private val ERROR_CODES = mapOf(
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT to "network",
    SpeechRecognizer.ERROR_NETWORK to "network",
    SpeechRecognizer.ERROR_AUDIO to "audio-capture",
    SpeechRecognizer.ERROR_SERVER to "server",
    SpeechRecognizer.ERROR_CLIENT to "client",
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT to "no-speech",
    SpeechRecognizer.ERROR_NO_MATCH to "no-match",
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY to "busy",
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS to "not-allowed",
    SpeechRecognizer.ERROR_TOO_MANY_REQUESTS to "too-many-requests",
    SpeechRecognizer.ERROR_SERVER_DISCONNECTED to "server-disconnected",
    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED to "language-not-supported",
    SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE to "language-unavailable",
    SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT to "cannot-check-support",
    SpeechRecognizer.ERROR_CANNOT_LISTEN_TO_DOWNLOAD_EVENTS to "cannot-check-support",
)

/** The recognizer has no language pack for the language here; the next [Mode] may still work. */
private val LANGUAGE_MISSING = setOf(SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)

/** How the plugin recognizes speech, best first; `label` is the `mode` of a listen result. */
private enum class Mode(val label: String) {
    /** SpeechRecognizer.createOnDeviceSpeechRecognizer (Android 12+): audio never leaves the phone. */
    ON_DEVICE("onDevice"),
    /** The system recognizer with EXTRA_PREFER_OFFLINE: on the phone when its offline pack is installed. */
    PREFER_OFFLINE("preferOffline"),
    /** The system recognizer as it chooses, which may use the network. */
    ONLINE("online"),
}

/**
 * The native side of src/platform/voicePlugin.ts: one recognition session per `listen` call. Recognizer state
 * lives on the main thread; [pending] is the call of the session in flight.
 */
@CapacitorPlugin(
    name = "TutorVoice",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = MICROPHONE)],
)
class TutorVoicePlugin : Plugin() {
    private var recognizer: SpeechRecognizer? = null
    private var recognizerOnDevice = false
    /** Moves to the next mode when a recognizer reports a missing language pack, for the app's lifetime. */
    private var mode = Mode.ON_DEVICE
    private var pending: PluginCall? = null

    @PluginMethod
    fun listen(call: PluginCall) {
        if (getPermissionState(MICROPHONE) != PermissionState.GRANTED) {
            requestPermissionForAlias(MICROPHONE, call, "microphonePermission")
            return
        }
        onMain { begin(call) }
    }

    @PermissionCallback
    private fun microphonePermission(call: PluginCall) {
        if (getPermissionState(MICROPHONE) != PermissionState.GRANTED) {
            call.reject("Microphone access is blocked. Allow the microphone for Pose Tutor to use voice commands.", "not-allowed")
            return
        }
        listen(call)
    }

    @PluginMethod
    fun cancel(call: PluginCall) = onMain {
        recognizer?.cancel()
        abortPending("cancel was called.")
        call.resolve()
    }

    private fun begin(call: PluginCall) {
        if (mode == Mode.ON_DEVICE && !onDeviceAvailable()) mode = Mode.PREFER_OFFLINE
        val onDevice = mode == Mode.ON_DEVICE
        if (!onDevice && !SpeechRecognizer.isRecognitionAvailable(context)) {
            call.reject("This phone has no speech recognizer.", "unavailable")
            return
        }
        recognizer?.cancel()
        abortPending("A newer listen call replaced this one.")
        val rec = recognizerFor(onDevice)
        pending = call
        rec.setRecognitionListener(Listener(call, mode))
        rec.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("language") ?: "en-US")
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, mode != Mode.ONLINE)
                .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName),
        )
    }

    private fun onDeviceAvailable(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    private fun recognizerFor(onDevice: Boolean): SpeechRecognizer {
        recognizer?.let { if (recognizerOnDevice == onDevice) return it }
        recognizer?.destroy()
        val created = if (onDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        } else {
            SpeechRecognizer.createSpeechRecognizer(context)
        }
        recognizer = created
        recognizerOnDevice = onDevice
        return created
    }

    private fun abortPending(reason: String) {
        pending?.reject(reason, "aborted")
        pending = null
    }

    private inner class Listener(private val call: PluginCall, private val used: Mode) : RecognitionListener {
        override fun onResults(results: Bundle) {
            if (pending !== call) return
            pending = null
            val text = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()
            call.resolve(JSObject().put("text", text?.ifEmpty { null } ?: JSONObject.NULL).put("mode", used.label))
        }

        override fun onError(error: Int) {
            if (pending !== call) return
            pending = null
            if (error in LANGUAGE_MISSING && used != Mode.ONLINE && used == mode) {
                mode = Mode.entries[used.ordinal + 1]
                Log.i(TAG, "${used.label} recognizer has no language pack (error $error); using ${mode.label}")
                begin(call)
                return
            }
            val code = ERROR_CODES[error] ?: "error-$error"
            call.reject("Speech recognition failed: $code", code)
        }

        override fun onReadyForSpeech(params: Bundle?) = Unit
        override fun onBeginningOfSpeech() = Unit
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit
        override fun onPartialResults(partialResults: Bundle?) = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit
    }

    override fun handleOnPause() {
        recognizer?.cancel()
        abortPending("The app went to the background.")
    }

    override fun handleOnDestroy() {
        recognizer?.destroy()
        recognizer = null
    }

    private fun onMain(block: () -> Unit) = bridge.executeOnMainThread(block)
}
