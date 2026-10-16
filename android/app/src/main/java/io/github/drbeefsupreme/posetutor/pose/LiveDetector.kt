package io.github.drbeefsupreme.posetutor.pose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.getcapacitor.JSObject
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** Frames per second the detector takes at most. */
private const val MAX_RATE = 30

/** The first answer can include GPU warm-up; after that a frame takes tens of milliseconds. */
private const val FIRST_ANSWER_MS = 3000L
private const val STALL_MS = 1000L

/** At most [perSecond] admissions in any second, spaced at least 90 % of the even gap apart. */
internal class RateGate(private val perSecond: Int) {
    private val admitted = LongArray(perSecond) { Long.MIN_VALUE / 2 }
    private var oldest = 0
    private val minGapMs = 900L / perSecond

    fun admit(now: Long): Boolean {
        val newest = admitted[(oldest + perSecond - 1) % perSecond]
        if (now - newest < minGapMs || now - admitted[oldest] < 1000) return false
        admitted[oldest] = now
        oldest = (oldest + 1) % perSecond
        return true
    }
}

/**
 * CameraX analyzer that runs upright RGBA frames through a LIVE_STREAM landmarker, one frame in flight at a time.
 * Everything except the result and error listeners runs on the analysis executor, so the frame bitmap is never
 * written while MediaPipe or [capture] reads it.
 */
internal class LiveDetector(
    private val context: Context,
    private val policy: DelegatePolicy,
    private val onFrame: (JSObject) -> Unit,
    /** The first result of a landmarker, with its delegate. */
    private val onAnswering: (Delegate) -> Unit,
    private val onUnavailable: (TrackingUnavailable) -> Unit,
) : ImageAnalysis.Analyzer {
    private var landmarker: PoseLandmarker? = null

    /** Read by the result listener; set before the first detection of each landmarker. */
    @Volatile
    private var delegate = Delegate.CPU
    private var unavailable = false
    private val gate = RateGate(MAX_RATE)
    private var lastTimestamp = 0L
    private var frame: Bitmap? = null
    private var packed: ByteBuffer? = null
    private var blank: Bitmap? = null

    /** uptime of the frame in flight, 0 when none. Written by both threads. */
    private val inFlightSince = AtomicLong(0)
    private val answered = AtomicBoolean(false)
    private val resetRequested = AtomicBoolean(false)

    /** Timestamp of the blank reset frame, whose result is not reported. */
    @Volatile
    private var blankTimestamp = -1L

    fun requestReset() = resetRequested.set(true)

    override fun analyze(image: ImageProxy) {
        image.use {
            if (unavailable) return
            val now = SystemClock.uptimeMillis()
            if (!readyFor(now) || !gate.admit(now) || now <= lastTimestamp) return
            val live = landmarker ?: open() ?: return
            lastTimestamp = now
            val input = if (resetRequested.getAndSet(false)) blankLike(image).also { blankTimestamp = now } else fill(image)
            inFlightSince.set(now)
            try {
                live.detectAsync(BitmapImageBuilder(input).build(), now)
            } catch (e: RuntimeException) {
                failed(e)
            }
        }
    }

    /** False while a frame is in flight; recovers a landmarker that stopped answering. */
    private fun readyFor(now: Long): Boolean {
        val since = inFlightSince.get()
        if (since == 0L) return true
        val limit = if (answered.get()) STALL_MS else FIRST_ANSWER_MS
        if (now - since < limit) return false
        failed(IllegalStateException("no result ${now - since} ms after a ${delegate.label} detection"))
        return true
    }

    /** The GPU delegate's first-detection failure reaches only logcat, so a missing answer counts as failure too. */
    private fun failed(reason: Exception) {
        Log.w(TAG, "live landmarker (${delegate.label}) failed", reason)
        if (delegate == Delegate.GPU) policy.gpuFailed(reason)
        closeLandmarker()
    }

    private fun open(): PoseLandmarker? = try {
        val (created, used) = policy.create(context, RunningMode.LIVE_STREAM) { options ->
            options.setResultListener { result, input ->
                val timestamp = result.timestampMs()
                inFlightSince.set(0)
                if (answered.compareAndSet(false, true)) onAnswering(delegate)
                if (timestamp != blankTimestamp) onFrame(poseFrame(result, timestamp, input.width, input.height))
            }
            options.setErrorListener { e -> Log.w(TAG, "live landmarker error", e) }
        }
        landmarker = created
        delegate = used
        created
    } catch (e: TrackingUnavailable) {
        unavailable = true
        onUnavailable(e)
        null
    }

    private fun closeLandmarker() {
        landmarker?.closeSafely()
        landmarker = null
        inFlightSince.set(0)
        answered.set(false)
    }

    /** Copies the upright RGBA frame into the reused bitmap, dropping any row padding. */
    private fun fill(image: ImageProxy): Bitmap {
        val width = image.width
        val height = image.height
        val bitmap = frame?.takeIf { it.width == width && it.height == height }
            ?: Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { frame = it }
        val plane = image.planes[0]
        val source = plane.buffer.apply { rewind() }
        val rowBytes = width * 4
        if (plane.rowStride == rowBytes) {
            bitmap.copyPixelsFromBuffer(source)
            return bitmap
        }
        val rows = packed?.takeIf { it.capacity() == rowBytes * height }
            ?: ByteBuffer.allocateDirect(rowBytes * height).also { packed = it }
        rows.clear()
        for (row in 0 until height) {
            source.limit(row * plane.rowStride + rowBytes)
            source.position(row * plane.rowStride)
            rows.put(source)
        }
        rows.flip()
        bitmap.copyPixelsFromBuffer(rows)
        return bitmap
    }

    private fun blankLike(image: ImageProxy): Bitmap =
        blank?.takeIf { it.width == image.width && it.height == image.height }
            ?: Bitmap.createBitmap(image.width, image.height, Bitmap.Config.ARGB_8888)
                .apply { eraseColor(Color.BLACK) }
                .also { blank = it }

    /** The latest detected frame as a JPEG data URL at most [maxWidth] pixels wide. Call on the analysis executor. */
    fun capture(maxWidth: Int): String? {
        val source = frame ?: return null
        val scale = minOf(1f, maxWidth.toFloat() / source.width)
        val photo = if (scale < 1f) {
            Bitmap.createScaledBitmap(source, (source.width * scale).toInt(), (source.height * scale).toInt(), true)
        } else {
            source
        }
        val jpeg = ByteArrayOutputStream()
        photo.compress(Bitmap.CompressFormat.JPEG, 88, jpeg)
        if (photo !== source) photo.recycle()
        return "data:image/jpeg;base64," + Base64.encodeToString(jpeg.toByteArray(), Base64.NO_WRAP)
    }

    /** Call on the analysis executor after the analyzer is cleared. */
    fun close() {
        closeLandmarker()
        frame = null
        blank = null
    }
}
