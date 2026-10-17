import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor's own logging is off: in debug builds it writes the options of every plugin call to logcat, and those
// include the TypeSafe key (TutorSecrets.set, the jev Authorization header).
const config: CapacitorConfig = {
  appId: 'io.github.drbeefsupreme.posetutor',
  appName: 'Pose Tutor',
  webDir: 'dist',
  loggingBehavior: 'none',
};

export default config;
