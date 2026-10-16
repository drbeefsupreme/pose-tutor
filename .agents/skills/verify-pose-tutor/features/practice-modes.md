# Practice modes

Besides Learn, the user has three ways to practice. Hold drill times a steady hold of one pose. Judge's calls runs a prejudging round: the head judge calls the quarter turns and the 8 mandatory poses in order, with 25 s for each. Mirror makes the 3D figure copy the user's body live, with no score.

## Sub-features

- `hold-goal` sets the hold time to 10, 20 or 30 s on the Hold drill card.
- `hold-run` scores the hold and ends with the mean score, the steadiness and the number of restarts.
- `judge-calls` speaks each call, scores it, and rests 2.5 s between calls.
- `judge-summary` shows a table of the calls with hit, timeout or skipped, and the round average. A new best round shows on the Judge card.
- `mirror-follow` moves the figure's limbs with the tracked body.

## How to get to it (user POV)

- On Home, choose `Start: <pose>` on the **Hold drill** card. Pick `10 s`, `20 s` or `30 s` first.
- On Home, choose `Start` on the **Judge's calls** card.
- On Home, choose `Start` on the **Mirror** card.

## Driving it with scripts/android/drive.ts

Preconditions:

- The baseline preconditions in [README.md](./README.md) hold.
- Each mode needs its own clip. Swap it while the app is on Home, then wait 6 s.

Steps:

- **Hold clip.** Run `$D clip docs/shots/verify/modes/hold.mp4 relaxedFront=4 frontDoubleBiceps=30` and `$D camera docs/shots/verify/modes/hold.mp4`.
- **Hold drill.** Choose the 10 s goal, then the Hold card. Run `$D click '.tutor-mode [role=group] button' '10 s'` and `$D click 'button[data-mode="hold"]'`. Then run `$D wait "window.__tutorState()?.view.stage.kind === 'done' && window.__tutorState().view.stage.summary" 120`. The summary has `mode: "hold"`, `result.goalMs: 10000`, a mean score near 99 and `resets: 0`.
- **Judge clip.** Run `$D clip docs/shots/verify/modes/judge.mp4 relaxedFront=10 quarterTurnLeftSide=20 relaxedBack=25` and `$D camera docs/shots/verify/modes/judge.mp4`.
- **Judge's calls.** Choose the Judge card. Run `$D click 'button[data-mode="judge"]'`. Read `$D eval "window.__tutorState().view.detail"` to follow `Next: call <n> of <total>`. After call 3, say stop: `$D eval "window.__tutorVoice('stop')"`. Then `$D wait "window.__tutorState().view.stage.kind === 'done' && window.__tutorState().view.stage.summary"`. Calls 1 to 3 have `outcome: "hit"`.
- **Mirror clip.** Run `$D clip docs/shots/verify/modes/mirror.mp4 relaxedFront=6 frontDoubleBiceps=6` and `$D camera docs/shots/verify/modes/mirror.mp4`.
- **Mirror.** Choose the Mirror card. Run `$D click 'button[data-mode="mirror"]'`. Take a shot while the clip is relaxed and one while the arms are up. The figure's arms are down in the first shot and up in the second.
- **Proof.** Save the summaries as JSON and the shots in `docs/shots/verify/modes/`.

## Gotchas

- The Hold clock restarts when the score drops under the line. `resets` counts that. A clip with a short pose part gives restarts, not a failure of the app.
- A quarter turn on the emulator scores 76 to 79 on single frames, close to the hold line. Give side views 20 s or more in a clip.
- Judge's calls runs 12 calls. A clip with three poses times out from call 4. Stop the round by voice after the calls you test.
- Mirror has no score and no summary result. Its proof is the figure's position, so compare two screenshots.
