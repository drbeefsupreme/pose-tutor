package io.github.drbeefsupreme.posetutor.coach

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import kotlin.math.roundToInt

/**
 * Gemini Nano sees images at 768 px on the short side: genai-prompt 1.0.0-beta4 scales any larger image down to it
 * before the call, so the plugin decodes straight to that size and never holds a full-size bitmap.
 */
internal const val NANO_IMAGE_SHORT_SIDE = 768

private val DATA_URL_HEADER = Regex("^data:image/(jpeg|jpg|png);base64,", RegexOption.IGNORE_CASE)

internal class BadImageException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Decodes a JPEG or PNG data URL to an ARGB bitmap with a short side of at most [NANO_IMAGE_SHORT_SIDE]. The app's
 * photos come from a canvas, so they have no EXIF orientation: the pixels are already upright and stay as decoded.
 */
internal fun decodeCoachImage(dataUrl: String): Bitmap {
    val header = DATA_URL_HEADER.find(dataUrl) ?: throw BadImageException("imageDataUrl must be a JPEG or PNG data URL")
    val bytes = try {
        Base64.decode(dataUrl.substring(header.range.last + 1), Base64.DEFAULT)
    } catch (e: IllegalArgumentException) {
        throw BadImageException("imageDataUrl is not valid base64", e)
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val shortSide = minOf(bounds.outWidth, bounds.outHeight)
    if (shortSide <= 0) throw BadImageException("imageDataUrl does not hold a JPEG or PNG image")

    var sampleSize = 1
    while (shortSide / (sampleSize * 2) >= NANO_IMAGE_SHORT_SIDE) sampleSize *= 2
    val options = BitmapFactory.Options().apply {
        inSampleSize = sampleSize
        inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        ?: throw BadImageException("imageDataUrl does not hold a JPEG or PNG image")

    val scale = NANO_IMAGE_SHORT_SIDE.toFloat() / minOf(decoded.width, decoded.height)
    if (scale >= 1f) return decoded
    val scaled = Bitmap.createScaledBitmap(decoded, (decoded.width * scale).roundToInt(), (decoded.height * scale).roundToInt(), true)
    if (scaled !== decoded) decoded.recycle()
    return scaled
}
