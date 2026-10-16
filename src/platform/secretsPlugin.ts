// The JavaScript face of the native secret store (Capacitor plugin name "TutorSecrets"). Values are encrypted
// with an AES-GCM key held in the Android Keystore (non-exportable) and kept in app-private storage, excluded from
// backup. The Kotlin side lives in android/app/src/main/java/io/github/drbeefsupreme/posetutor/secrets/.

/** The only secret the app stores today. */
export type SecretKey = 'typesafe-api-key';

/** Rejections carry `code`: `badKey` (unknown key name) or `keystore` (the Keystore failed; `message` says how). */
export interface TutorSecretsPlugin {
  get(options: { key: SecretKey }): Promise<{ value: string | null }>;
  set(options: { key: SecretKey; value: string }): Promise<void>;
  remove(options: { key: SecretKey }): Promise<void>;
}
