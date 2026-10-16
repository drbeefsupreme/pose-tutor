package io.github.drbeefsupreme.posetutor.secrets

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEYSTORE = "AndroidKeyStore"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val TAG_BITS = 128
private const val PREFS = "tutor_secrets"

/** The `SecretKey` names of secretsPlugin.ts. */
internal enum class SecretName(val id: String) {
    TYPESAFE_API_KEY("typesafe-api-key");

    companion object {
        fun parse(id: String?): SecretName? = entries.firstOrNull { it.id == id }
    }
}

internal class KeystoreFailure(message: String, cause: Throwable) : Exception(message, cause)

/** The app's backup rules (res/xml/data_extraction_rules.xml) exclude these SharedPreferences. */
internal class SecretStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val alias = "${context.packageName}.secrets"

    @Synchronized
    fun get(name: SecretName): String? = keystore("read ${name.id}") {
        val stored = prefs.getString(name.id, null) ?: return@keystore null
        val parts = stored.split(':', limit = 2).map { Base64.decode(it, Base64.NO_WRAP) }
        require(parts.size == 2) { "no IV separator" }
        val (iv, ciphertext) = parts
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
            updateAAD(name.id.toByteArray())
        }
        String(cipher.doFinal(ciphertext), Charsets.UTF_8)
    }

    @Synchronized
    fun set(name: SecretName, value: String) = keystore("store ${name.id}") {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, key())
            updateAAD(name.id.toByteArray())
        }
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val stored = "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(ciphertext, Base64.NO_WRAP)}"
        if (!prefs.edit().putString(name.id, stored).commit()) throw IOException("SharedPreferences did not save ${name.id}")
    }

    @Synchronized
    fun remove(name: SecretName) = keystore("remove ${name.id}") {
        if (!prefs.edit().remove(name.id).commit()) throw IOException("SharedPreferences did not remove ${name.id}")
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(false)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply { init(spec) }.generateKey()
    }

    private inline fun <T> keystore(action: String, block: () -> T): T = try {
        block()
    } catch (e: GeneralSecurityException) {
        throw KeystoreFailure("Could not $action: ${e.javaClass.simpleName} ${e.message.orEmpty()}".trim(), e)
    } catch (e: ProviderException) {
        throw KeystoreFailure("Could not $action: ${e.javaClass.simpleName} ${e.message.orEmpty()}".trim(), e)
    } catch (e: IOException) {
        throw KeystoreFailure("Could not $action: ${e.message.orEmpty()}".trim(), e)
    } catch (e: IllegalArgumentException) {
        throw KeystoreFailure("Could not $action: the stored value is damaged", e)
    }
}
