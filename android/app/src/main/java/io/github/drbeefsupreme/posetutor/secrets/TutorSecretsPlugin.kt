package io.github.drbeefsupreme.posetutor.secrets

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

private const val BAD_KEY = "badKey"
private const val KEYSTORE_FAILED = "keystore"

/** The native side of src/platform/secretsPlugin.ts. Only the names in [SecretName] are accepted. */
@CapacitorPlugin(name = "TutorSecrets")
class TutorSecretsPlugin : Plugin() {
    private val store by lazy { SecretStore(context) }

    @PluginMethod
    fun get(call: PluginCall) = withName(call) { name ->
        call.resolve(JSObject().put("value", store.get(name) ?: JSONObject.NULL))
    }

    @PluginMethod
    fun set(call: PluginCall) = withName(call) { name ->
        val value = call.getString("value")
        if (value == null) {
            call.reject("set needs a string value")
        } else {
            store.set(name, value)
            call.resolve()
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) = withName(call) { name ->
        store.remove(name)
        call.resolve()
    }

    private inline fun withName(call: PluginCall, action: (SecretName) -> Unit) {
        val key = call.getString("key")
        val name = SecretName.parse(key)
        if (name == null) {
            call.reject("Unknown secret key \"$key\". Allowed: ${SecretName.entries.joinToString { it.id }}.", BAD_KEY)
            return
        }
        try {
            action(name)
        } catch (e: KeystoreFailure) {
            call.reject(e.message, KEYSTORE_FAILED)
        }
    }
}
