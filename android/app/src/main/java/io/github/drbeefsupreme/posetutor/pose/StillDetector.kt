package io.github.drbeefsupreme.posetutor.pose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.SystemClock
import android.util.Base64
import com.getcapacitor.JSObject
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import java.util.EnumMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** MediaPipe VIDEO mode tracks from call to call like live tracking, so calls with a timestamp use it. */
internal class StillDetector(private val context: Context, private val policy: DelegatePolicy) {
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val landmarkers = EnumMap<RunningMode, Pair<PoseLandmarker, Delegate>>(RunningMode::class.java)
    private var lastTimestampMs = Long.MIN_VALUE

    fun detect(dataUrl: String, timestampMs: Long?, done: (Result<JSObject>) -> Unit) {
        executor.execute {
            done(
                runCatching {
                    val bitmap = decode(dataUrl)
                    val (result, delegate) = run(BitmapImageBuilder(bitmap).build(), timestampMs)
                    JSObject().apply {
                        put("frame", poseFrame(result, timestampMs ?: SystemClock.uptimeMillis(), bitmap.width, bitmap.height))
                        put("delegate", delegate.label)
                    }
                },
            )
        }
    }

    private fun run(image: MPImage, timestampMs: Long?): Pair<PoseLandmarkerResult, Delegate> {
        val mode = if (timestampMs == null) RunningMode.IMAGE else RunningMode.VIDEO
        if (timestampMs != null) {
            require(timestampMs > lastTimestampMs) { "timestampMs must grow: $timestampMs after $lastTimestampMs" }
            lastTimestampMs = timestampMs
        }
        val detect = { l: PoseLandmarker -> if (timestampMs == null) l.detect(image) else l.detectForVideo(image, timestampMs) }
        val (current, delegate) = landmarkers.getOrPut(mode) { policy.create(context, mode) }
        return try {
            detect(current) to delegate
        } catch (e: RuntimeException) {
            if (delegate != Delegate.GPU) throw e
            policy.gpuFailed(e)
            current.closeSafely()
            val cpu = policy.create(context, mode).also { landmarkers[mode] = it }
            detect(cpu.first) to cpu.second
        }
    }

    private fun decode(dataUrl: String): Bitmap {
        val comma = dataUrl.indexOf(',')
        require(dataUrl.startsWith("data:image/") && comma > 0) { "dataUrl must be a PNG or JPEG data URL" }
        val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
        val options = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
        return requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)) { "the image cannot be decoded" }
    }

    fun resetTrack() = executor.execute {
        landmarkers.remove(RunningMode.VIDEO)?.first?.closeSafely()
        lastTimestampMs = Long.MIN_VALUE
    }

    fun release() = executor.execute {
        landmarkers.values.forEach { it.first.closeSafely() }
        landmarkers.clear()
        lastTimestampMs = Long.MIN_VALUE
    }

    fun shutdown() {
        release()
        executor.shutdown()
    }
}
