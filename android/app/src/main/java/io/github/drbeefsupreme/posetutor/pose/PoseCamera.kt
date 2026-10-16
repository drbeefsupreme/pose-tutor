package io.github.drbeefsupreme.posetutor.pose

import android.graphics.Color
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import android.view.ViewGroup
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LiveData
import androidx.lifecycle.Observer
import com.getcapacitor.JSObject
import com.google.mediapipe.tasks.core.Delegate
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.roundToInt

internal data class PreviewRect(val x: Double, val y: Double, val width: Double, val height: Double)

/** Analysis frames in sensor orientation; 1280 px wide upright photos in landscape, 960 in portrait. */
private val ANALYSIS_SIZE = Size(1280, 960)
private const val FIRST_FRAME_TIMEOUT_MS = 10_000L

/** Preview and analysis are both 4:3 so they show the same field of view. */
internal class PoseCamera(
    private val activity: AppCompatActivity,
    private val webView: WebView,
    policy: DelegatePolicy,
    private val events: Events,
) {
    interface Events {
        fun onFrame(frame: JSObject)

        fun onReady(delegate: Delegate)

        fun onFailed(failure: CameraFailure, message: String)
    }

    private enum class Phase { OPENING, RUNNING, CLOSED }

    private var phase = Phase.OPENING
    private var devicePixelRatio = 1.0
    private val main = Handler(Looper.getMainLooper())
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val previewView = PreviewView(activity).apply {
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
    }
    private val preview = Preview.Builder().setResolutionSelector(fourByThree(null)).build()
    private val analysis = ImageAnalysis.Builder()
        .setResolutionSelector(fourByThree(ANALYSIS_SIZE))
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
        .setOutputImageRotationEnabled(true)
        .build()
    private val detector = LiveDetector(
        activity,
        policy,
        onFrame = events::onFrame,
        onAnswering = { delegate -> main.post { answering(delegate) } },
        onUnavailable = { e -> main.post { fail(CameraFailure.UNSUPPORTED, e.message ?: "Pose tracking cannot run.") } },
    )
    private var provider: ProcessCameraProvider? = null
    private var cameraState: LiveData<CameraState>? = null
    private val cameraObserver = Observer<CameraState> { state -> state.error?.let(::cameraError) }
    private val displays = ContextCompat.getSystemService(activity, DisplayManager::class.java)
    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayChanged(displayId: Int) = followRotation()
        override fun onDisplayAdded(displayId: Int) = Unit
        override fun onDisplayRemoved(displayId: Int) = Unit
    }
    private val firstFrameTimeout = Runnable { fail(CameraFailure.BUSY, "The camera started but sent no frames.") }

    fun open(rect: PreviewRect, devicePixelRatio: Double) {
        this.devicePixelRatio = devicePixelRatio
        val parent = webView.parent as ViewGroup
        parent.addView(previewView, parent.indexOfChild(webView), ViewGroup.LayoutParams(0, 0))
        place(rect)
        webView.setBackgroundColor(Color.TRANSPARENT)
        displays?.registerDisplayListener(displayListener, main)
        main.postDelayed(firstFrameTimeout, FIRST_FRAME_TIMEOUT_MS)
        val future = ProcessCameraProvider.getInstance(activity)
        future.addListener({ bind(runCatching { future.get() }) }, ContextCompat.getMainExecutor(activity))
    }

    private fun bind(found: Result<ProcessCameraProvider>) {
        if (phase == Phase.CLOSED) return
        val cameras = found.getOrElse {
            fail(CameraFailure.BUSY, "The camera service failed: ${it.message}")
            return
        }
        provider = cameras
        if (!runCatching { cameras.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) }.getOrDefault(false)) {
            fail(CameraFailure.NO_DEVICE, "This device has no front camera.")
            return
        }
        followRotation()
        preview.surfaceProvider = previewView.surfaceProvider
        analysis.setAnalyzer(executor, detector)
        val camera = try {
            cameras.bindToLifecycle(activity, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis)
        } catch (e: IllegalArgumentException) {
            fail(CameraFailure.NO_DEVICE, "The front camera cannot run the preview and analysis: ${e.message}")
            return
        } catch (e: IllegalStateException) {
            fail(CameraFailure.BUSY, "The camera failed to start: ${e.message}")
            return
        }
        cameraState = camera.cameraInfo.cameraState.also { it.observe(activity, cameraObserver) }
    }

    /** While opening, errors CameraX does not retry (and an in-use camera) fail the start; later they are logged. */
    private fun cameraError(error: CameraState.StateError) {
        Log.w(TAG, "camera error ${error.code} (${error.type})", error.cause)
        val failure = when (error.code) {
            CameraState.ERROR_CAMERA_DISABLED -> CameraFailure.DENIED
            CameraState.ERROR_CAMERA_REMOVED -> CameraFailure.NO_DEVICE
            CameraState.ERROR_CAMERA_IN_USE, CameraState.ERROR_MAX_CAMERAS_IN_USE -> CameraFailure.BUSY
            else -> if (error.type == CameraState.ErrorType.CRITICAL) CameraFailure.BUSY else return
        }
        if (phase == Phase.OPENING) fail(failure, "The camera failed to open (CameraX error ${error.code}).")
    }

    private fun answering(delegate: Delegate) {
        Log.i(TAG, "tracking on the ${delegate.label}")
        if (phase != Phase.OPENING) return
        phase = Phase.RUNNING
        main.removeCallbacks(firstFrameTimeout)
        events.onReady(delegate)
    }

    private fun fail(failure: CameraFailure, message: String) {
        if (phase == Phase.CLOSED) return
        close()
        events.onFailed(failure, message)
    }

    private fun followRotation() {
        val rotation = webView.display?.rotation ?: return
        preview.targetRotation = rotation
        analysis.targetRotation = rotation
    }

    fun place(rect: PreviewRect) {
        previewView.layoutParams = previewView.layoutParams.apply {
            width = (rect.width * devicePixelRatio).roundToInt()
            height = (rect.height * devicePixelRatio).roundToInt()
        }
        previewView.x = webView.x + (rect.x * devicePixelRatio).toFloat()
        previewView.y = webView.y + (rect.y * devicePixelRatio).toFloat()
    }

    fun reset() = detector.requestReset()

    fun capture(maxWidth: Int, done: (String?) -> Unit) {
        if (phase == Phase.CLOSED) done(null) else executor.execute { done(detector.capture(maxWidth)) }
    }

    fun close() {
        if (phase == Phase.CLOSED) return
        phase = Phase.CLOSED
        main.removeCallbacks(firstFrameTimeout)
        displays?.unregisterDisplayListener(displayListener)
        cameraState?.removeObserver(cameraObserver)
        provider?.unbind(preview, analysis)
        analysis.clearAnalyzer()
        executor.execute(detector::close)
        executor.shutdown()
        (previewView.parent as? ViewGroup)?.removeView(previewView)
        webView.setBackgroundColor(Color.WHITE)
    }
}

private fun fourByThree(size: Size?): ResolutionSelector = ResolutionSelector.Builder()
    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
    .apply {
        if (size != null) {
            setResolutionStrategy(ResolutionStrategy(size, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
        }
    }
    .build()
