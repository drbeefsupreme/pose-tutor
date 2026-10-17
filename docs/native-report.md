# TutorCoach and TutorSecrets on the emulator

- When: 2026-10-17T00:44:08.127Z
- Device: emulator-5564 (AVD pose-tutor-harness, Android 15, x86_64), AICore: (not installed)
- APK: android/app/build/outputs/apk/debug/app-x86_64-debug.apk
- Usage-metrics queue (com.google.android.datatransport, used by MediaPipe and ML Kit; disclosed in README.md, What leaves the phone): app databases: com.google.android.datatransport.events, com.google.android.datatransport.events-journal; scheduled jobs of the app: 5 (JOB #u0a209/-1688196438: 4e34ab9 io.github.drbeefsupreme.posetutor/com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService; u0a209 tag=*job*/io.github.drbeefsupreme.posetutor/com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService; Service: io.github.drbeefsupreme.posetutor/com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService; JobStatus{4e34ab9 #u0a209/-1688196438 io.github.drbeefsupreme.posetutor/com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService u=0 s=10209 TIME=+23h59m56s8ms:none NET IDLE satisfied:0x13600000 unsatisfied:0x80000004}: 108020632; 0-ComponentInfo{io.github.drbeefsupreme.posetutor/com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService}: io.github.drbeefsupreme.posetutor)
- Result: 20/20 checks pass

| Check | Result | Detail |
|---|---|---|
| coach status is unavailable with a reason | PASS | resolved {"status":"unavailable","reason":"This is an emulator. It has no AICore, so Gemini Nano cannot run here."} |
| coach download rejects with unavailable | PASS | rejected code=unavailable message="This is an emulator. It has no AICore, so Gemini Nano cannot run here."; listener added: true; progress events: 0 |
| coach generate (4032x3024 JPEG) rejects with unavailable | PASS | rejected code=unavailable message="This is an emulator. It has no AICore, so Gemini Nano cannot run here." |
| coach generate (600x800 PNG) rejects with unavailable | PASS | rejected code=unavailable message="This is an emulator. It has no AICore, so Gemini Nano cannot run here." |
| coach generate (text only) rejects with unavailable | PASS | rejected code=unavailable message="This is an emulator. It has no AICore, so Gemini Nano cannot run here." |
| coach generate (not an image) rejects with badImage | PASS | rejected code=badImage message="imageDataUrl does not hold a JPEG or PNG image" |
| coach generate (not a data URL) rejects with badImage | PASS | rejected code=badImage message="imageDataUrl must be a JPEG or PNG data URL" |
| coach generate x3 at once (a big image first): the first runs, a later one gets busy | PASS | codes in call order ["unavailable","busy","busy"] |
| images are downsized to a 768 px short side (larger ones only) | PASS | decoded sizes in call order: ["1024x768","600x800","1024x768"] |
| secrets get before set is null | PASS | resolved {"value":null} |
| secrets set resolves | PASS | resolved null |
| secrets get returns the value | PASS | resolved the dummy value |
| the prefs file holds no plaintext | PASS | shared_prefs/tutor_secrets.xml: 189 bytes, dummy absent (see prefs-after-set.xml) |
| secrets survive force-stop and relaunch | PASS | process gone after force-stop: true; get resolved the dummy value |
| secrets get with an unknown key rejects with badKey | PASS | rejected code=badKey message="Unknown secret key \"other-key\". Allowed: typesafe-api-key." |
| secrets set with an unknown key rejects with badKey | PASS | rejected code=badKey message="Unknown secret key \"other-key\". Allowed: typesafe-api-key." |
| secrets remove without a key rejects with badKey | PASS | rejected code=badKey message="Unknown secret key \"null\". Allowed: typesafe-api-key." |
| secrets remove clears the value | PASS | resolved null; then get resolved {"value":null} |
| no crash, no exception from the app code | PASS | app pids 1971, 3281; crash buffer empty; stack lines in app code: 0; other exception lines in the app processes: 0 (tags: none; see logcat-app.txt) |
| logcat does not contain the secret value | PASS | 0 lines with the dummy value |
