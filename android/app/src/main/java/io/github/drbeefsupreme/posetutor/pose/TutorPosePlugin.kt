package io.github.drbeefsupreme.posetutor.pose

import android.Manifest
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.mediapipe.tasks.core.Delegate
import org.json.JSONObject

private const val CAMERA = "camera"

/**
 * The native side of src/platform/posePlugin.ts. Camera state lives on the main thread: [request] is what JS
 * asked for (kept across pause), [camera] the running camera (only while the app is in the foreground).
 */
@CapacitorPlugin(
    name = "TutorPose",
    permissions = [Permission(strings = [Manifest.permission.CAMERA], alias = CAMERA)],
)
class TutorPosePlugin : Plugin() {
    private class Request(val rect: PreviewRect, val devicePixelRatio: Double)

    private val policy = DelegatePolicy()
    private lateinit var still: StillDetector
    private var request: Request? = null
    private var camera: PoseCamera? = null
    private var pendingStart: PluginCall? = null
    private var resumed = true

    override fun load() {
        still = StillDetector(context, policy)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val rect = previewRect(call.getObject("rect"))
        val dpr = call.getDouble("devicePixelRatio")
        if (rect == null || dpr == null || dpr <= 0) {
            call.reject("start needs rect { x, y, width, height } and devicePixelRatio")
            return
        }
        if (getPermissionState(CAMERA) != PermissionState.GRANTED) {
            requestPermissionForAlias(CAMERA, call, "cameraPermission")
            return
        }
        onMain { begin(call, Request(rect, dpr)) }
    }

    @PermissionCallback
    private fun cameraPermission(call: PluginCall) {
        if (getPermissionState(CAMERA) != PermissionState.GRANTED) {
            call.reject("Camera access is blocked. Allow the camera for Pose Tutor and try again.", CameraFailure.DENIED.code)
            return
        }
        start(call)
    }

    private fun begin(call: PluginCall, next: Request) {
        pendingStart?.reject("A newer start call replaced this one.", CameraFailure.BUSY.code)
        pendingStart = call
        request = next
        closeCamera()
        if (resumed) openCamera(next)
    }

    @PluginMethod
    fun setPreviewRect(call: PluginCall) {
        val rect = previewRect(call.getObject("rect"))
        if (rect == null) {
            call.reject("setPreviewRect needs rect { x, y, width, height }")
            return
        }
        onMain {
            request = request?.let { Request(rect, it.devicePixelRatio) }
            camera?.place(rect)
            call.resolve()
        }
    }

    @PluginMethod
    fun reset(call: PluginCall) = onMain {
        camera?.reset()
        still.resetTrack()
        call.resolve()
    }

    @PluginMethod
    fun capturePhoto(call: PluginCall) {
        val maxWidth = call.getInt("maxWidth")
        if (maxWidth == null || maxWidth <= 0) {
            call.reject("capturePhoto needs maxWidth > 0")
            return
        }
        onMain {
            val running = camera
            if (running == null) {
                call.resolve(JSObject().put("dataUrl", JSONObject.NULL))
            } else {
                running.capture(maxWidth) { url -> call.resolve(JSObject().put("dataUrl", url ?: JSONObject.NULL)) }
            }
        }
    }

    @PluginMethod
    fun detectImage(call: PluginCall) {
        val dataUrl = call.getString("dataUrl")
        if (dataUrl == null) {
            call.reject("detectImage needs dataUrl")
            return
        }
        val timestampMs = (call.data.opt("timestampMs") as? Number)?.let { Math.round(it.toDouble()) }
        still.detect(dataUrl, timestampMs) { result ->
            result.fold(call::resolve) { e -> call.reject(e.message ?: "detectImage failed", e as? Exception) }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) = onMain {
        pendingStart?.reject("stop was called before the camera started.", CameraFailure.BUSY.code)
        pendingStart = null
        request = null
        closeCamera()
        call.resolve()
    }

    private fun openCamera(next: Request) {
        val opened = PoseCamera(activity, bridge.webView, policy, Events())
        camera = opened
        opened.open(next.rect, next.devicePixelRatio)
    }

    private fun closeCamera() {
        camera?.close()
        camera = null
    }

    private inner class Events : PoseCamera.Events {
        override fun onFrame(frame: JSObject) = notifyListeners("frame", frame)

        override fun onReady(delegate: Delegate) {
            pendingStart?.resolve(JSObject().put("delegate", delegate.label))
            pendingStart = null
        }

        override fun onFailed(failure: CameraFailure, message: String) {
            Log.w(TAG, "camera failed: ${failure.code}: $message")
            camera = null
            request = null
            pendingStart?.reject(message, failure.code)
            pendingStart = null
        }
    }

    override fun handleOnPause() {
        resumed = false
        closeCamera()
        still.release()
    }

    override fun handleOnResume() {
        resumed = true
        val wanted = request ?: return
        if (camera == null) openCamera(wanted)
    }

    override fun handleOnDestroy() {
        closeCamera()
        still.shutdown()
    }

    private fun onMain(block: () -> Unit) = bridge.executeOnMainThread(block)
}

private fun previewRect(json: JSObject?): PreviewRect? {
    if (json == null) return null
    val values = listOf("x", "y", "width", "height").map { key -> json.optDouble(key).takeUnless { it.isNaN() } ?: return null }
    val (x, y, width, height) = values
    return PreviewRect(x, y, width, height).takeIf { width > 0 && height > 0 }
}
