# Progress photos

At every hit, the app saves a photo of the user with the pose, the score, the faults and the landmarks. The photos stay on the phone. The Progress screen shows them per pose as a timeline, a before and after compare, and a score trend, and the user can delete them.

## Sub-features

- `photo-save` writes a JPEG and a JSON sidecar with the same id to the app's `files` storage at a hit, and shows `Photo saved · <score>` in the run.
- `progress-poses` lists the poses with a photo count each.
- `progress-timeline` shows the photos of one pose, oldest first, with the score.
- `progress-compare` shows photo A and photo B side by side or as an onion skin with a blend slider, and the score change.
- `progress-skeleton` draws the saved landmarks over the photos.
- `progress-delete` deletes one photo, or all photos of a pose, after a confirm dialog.

## How to get to it (user POV)

- Hit a pose in Learn, Hold drill or Judge's calls. The run shows `Photo saved`.
- On Home, choose `Open` on the **Progress** card.
- On the Progress screen, choose a pose, a thumbnail, `Side by side`, `Onion skin`, `Skeleton`, or the delete button of a thumbnail.

## Driving it with scripts/android/drive.ts

Preconditions:

- The baseline preconditions in [README.md](./README.md) hold.
- The app has two or more photos of one pose. Run Learn to a hit twice, as in [run-loop.md](./run-loop.md). Use `Again` on the summary for the second hit.

Steps:

- **Photo at the hit.** After a hit, run `$D wait "window.__tutorState().photo && JSON.stringify({ id: window.__tutorState().photo.id, score: window.__tutorState().photo.score })"`. The run shows `[data-testid="photo"]`.
- **Files on the phone.** Run `source scripts/android/env.sh` and `adb -s emulator-5564 shell run-as io.github.drbeefsupreme.posetutor ls files/photos`. Each photo id has a `.jpg` and a `.json`. Copy one out with `adb -s emulator-5564 exec-out run-as io.github.drbeefsupreme.posetutor cat files/photos/<id>.json`. The sidecar has `pose`, `score`, `faults` and `landmarks`.
- **Open Progress.** Return to Home, then choose the Progress card. Run `$D click '.tutor-summary .pill' 'Back to the tutor'` and `$D click 'button[data-mode="progress"]'`. Then `$D wait "document.querySelectorAll('.progress-thumb').length"` prints the number of photos of the pose.
- **Compare.** Choose the onion skin. Run `$D click '.progress-compare-bar .seg button' 'Onion skin'` and `$D shot docs/shots/verify/progress/compare-onion.png`. The screenshot shows two photos blended and the score change.
- **Delete one photo.** Run `$D click '.progress-thumb-delete'` and `$D click '.progress-dialog .btn' 'Delete photo'`. The thumbnail count drops by 1, and the `adb ... ls files/photos` command above lists one `.jpg` and one `.json` fewer.
- **Proof.** Save the screenshots, the `ls` output before and after the delete, and one sidecar in `docs/shots/verify/progress/`.

## Gotchas

- The Progress screen opens on the pose of the newest photo. Choose another pose under `.progress-pose`.
- The compare needs two photos of the same pose. With one photo, the screen says `Save one more photo of this pose to compare two dates.`
- `$D launch` clears the app data after the install, so a new session starts with no photos. Count the files before and after an action.
- The photos are JPEG, 960 x 1280 in portrait. A zero-byte file or a missing sidecar is a fault.
