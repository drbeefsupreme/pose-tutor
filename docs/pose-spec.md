# Men's bodybuilding pose spec for the pose tutor

The research behind the scoring spec (src/pose/spec.ts). All sources were fetched on 2026-10-10.

This file serves two readers. The pose-scoring engine needs camera-visible targets with pass bands. The voice coach needs faults, short spoken cues, and a build-up order. Every pose section has the same five parts: official text, geometry targets, coach-only cues, faults, and build-up steps. Left-right variants have their own section after the poses.

## How to read the numbers

Every number carries one tag.

- `[S7]` points to the sources list at the end.
- `[M 88..102, n=3]` is my own measurement on n official or federation reference photos with MediaPipe Pose. The range is minimum..maximum, with both arms pooled when both arms do the same thing. The method and the full table are in "Reference measurements".
- `[ESTIMATE]` is my judgment. Every pass band is an estimate. My default band is the measured range widened by about 10° for angles or 0.10 for ratios. I then adjusted it to rulebook limits and to the spread between coaches.
- `[CODE]` is a fact read from this repository.

Spoken cues are my wording. The source column of each fault row says where the fault itself comes from.

## Metric definitions

The camera stands where the judges sit: in front of the athlete, at about judge eye level, with the whole body in frame. Mentzer's method also records every pose "from the judges' approximate eye level" [S18]. Left and right are always the athlete's own sides. "Near" is the side closer to the camera.

All angles are measured in the image plane on BlazePose-style 2D landmarks (nose, ears, shoulders, elbows, wrists, hips, knees, ankles, heels, toes). "Torso" is the image distance from the mid-shoulder point to the mid-hip point. Heights are in torso lengths and are positive above the reference point. The engine should capture one relaxed-front calibration frame per user, because several metrics compare against the user's own baseline [ESTIMATE].

| Metric | Definition | Evidence and limits |
|---|---|---|
| facing | front, back, left_side, right_side, or three_quarter | Classify with hip_width, then lr_order. |
| hip_width | hip-to-hip distance / torso | Front and back poses read 0.32..0.51, side poses 0.12..0.26 [M n=26]. A cut at 0.28 separated all 26 references [M]. Three_quarter: hips turned about 30..60° [ESTIMATE]. No mandatory pose is three-quarter. |
| lr_order | true when the left shoulder is on the image right | True in 20 of 20 front and side references, false in 6 of 6 back references [M]. The nose read 0.96..1.00 visibility in every back view [M], so the nose cannot detect a back view. |
| shoulder_width | shoulder-to-shoulder distance / torso | Shrinks when the arms go overhead: 0.54..0.60 in abdominals and thighs [M n=3]. Use it for twist, not for facing. |
| twist | upper body turned toward the camera, relative to the hips | 2D estimate: angle = acos(width / calibrated front width) for shoulders and for hips, then the difference [ESTIMATE model]. |
| stance_ratio | horizontal ankle-to-ankle distance / horizontal shoulder-to-shoulder distance | Front and back views only. To convert a rulebook distance, divide by the user's shoulder width. |
| stagger | horizontal ankle-to-ankle distance / torso | Side views only: the front-back spread of the feet. Relaxed side 0.00, side chest 0.02..0.08, side triceps 0.06..0.50 [M]. |
| knee_flex | 180° minus the hip-knee-ankle angle | 0° is a straight leg. |
| heel_lift | (toe_y minus heel_y) / heel-to-toe length, image y pointing down | Side views only. In the side chest photos, the near foot (on its toes by rule) read 0.41..0.82 and the far foot read 0.06..0.13 [M n=3]. A flat foot that points toward the camera read 0.59 [M n=1], and flat feet in front views read 0.37..0.61 [M], so the metric fails when the foot points at the camera. |
| abduction | angle between the upper arm (shoulder to elbow) and the trunk midline (mid-shoulder to mid-hip) | 0° is an arm along the trunk, 90° is perpendicular, 180° is overhead. In side views it cannot see forward arm movement. |
| elbow_flex | 180° minus the shoulder-elbow-wrist angle | 0° is a straight arm. |
| elbow_height, wrist_height | (shoulder_y minus elbow_y or wrist_y) / torso | Positive is above the shoulder. |
| wrist_vs_nose | (nose_y minus wrist_y) / torso | Positive is above the nose. |
| forearm_angle | direction of elbow-to-wrist, measured from image up | 0° is a vertical forearm with the fist up, 90° is horizontal, 180° points down. |
| elbow_span | elbow-to-elbow distance / shoulder-to-shoulder distance | 2D sign of "elbows wide" in the lat spreads and abdominals and thighs. |
| wrist_gap | wrist-to-wrist distance / torso | Gripping or touching hands read 0.16..0.31 [M n=4]. |
| wrist_vis | estimator visibility of a wrist | Hidden wrists read 0.00..0.26, visible wrists 0.53..1.00 [M]. Never score a hidden wrist. |
| head_yaw | (nose_x minus mid-ear x) / ear-to-ear distance | Not measured in this study. All thresholds are [ESTIMATE]. |
| lean | trunk tilt toward the camera from single-image 3D landmarks | Noisy. The eleven front-facing references other than the crab read -2.5..16.4°, and the crab most muscular read 38.3° [M]. Use it only for large leans, and only against the user's own calibration. |
| shrug | vertical ear-to-shoulder distance / the same distance in calibration | Not measured. A drop below 0.80 counts as a shrug [ESTIMATE]. |

## Federation differences that change the target

| Federation | Poses called | Quarter turns | Timing | Pose text |
|---|---|---|---|---|
| IFBB amateur, 2026 [S1] | 7 mandatory poses, no most muscular. The elimination round uses 4: front double biceps, side chest, back double biceps, abdominals and thighs. | None in men's bodybuilding | Finals: the 6 finalists do the 7 poses as a group, then "reverse the order of the competitors" and repeat all 7, then a "30- to 60-second Posedown" that is not scored. No free posing round. | Detailed (Appendix 1). Pose text is word-for-word the same as 2019 [S2] apart from one heading word (word diff). |
| IFBB Pro League [S4] | 8: the 7 plus most muscular | Yes | "up to a maximum of 60 seconds" to perform the 8 poses individually. Finals: routine of "up to a maximum of three minutes" and a "60-second posedown". | Names only |
| NPC [S5] | 8: the 7 plus most muscular | Yes | "maximum of 60 seconds" for the mandatory poses. Finals routine "maximum of 60 seconds". Posedown of 60 seconds for the overall title only. | Names only, plus a ban on pulling up the suit in both lat spreads |
| WNBF, 2026 [S6] | Symmetry round (front, side, rear symmetry poses) and muscularity round (7 poses plus hands-on-hips and crab most muscular). Each round is 50%. The women's section marks both most musculars "optional per Head judge instructions"; the men's section does not. | Yes, to the right | Routine of 60 seconds, not scored | Detailed bullets and posing tips |
| OCB [S9] | Calls right and left side chest, right and left side triceps, "Hands over Head Abdominals", hands-on-thighs or hips most muscular, crab most muscular | Yes, to the right | "get into their poses as quickly as possible" | Pictures only |

## Rules that apply to every pose

- Position the limbs first, then contract. Human Kinetics gives the order for the front double biceps: legs, core, lats, arms, then "only then contract everything" [S14].
- Contract every visible muscle, and skip muscles the judges cannot see [S14].
- "Practice shrugging down in nearly every pose" [S14].
- Keep the abs "contracted (barely, but taut)" in every front or side pose [S14].
- Breathe shallowly so the waist stays still [S14].
- Smile when you face the judges [S14].
- Do not over-contract, because hard contraction risks cramps and tires you [S14].

---

## 1. Relaxed front (front symmetry pose)

Called in the WNBF symmetry round [S6], OCB comparisons [S9], and NPC and IFBB Pro quarter turns [S4][S5]. IFBB 2026 men's bodybuilding has no quarter turns [S1]. The nearest IFBB text is the 2019 Men's Classic Physique front position [S3].

Official text:
- IFBB [S3]: "heels inline and up to 15 cm apart, feet inclined outward at a 30° angle, knees unbent, stomach in, chest out, shoulders back, head up, both arms hanging down ... elbows slightly bent, thumbs and fingers together, palms facing the body, hands clenched into fists."
- WNBF [S6]: "Arms should be to the sides (not touching or exaggerated wide). Lats should be open/flared to show V-taper. Feet should be together or slightly apart, toes facing forward, feet flat on the stage." Tip: "not flexing individual muscles."
- WNBF Australia [S8]: "toes pointing outwards", "slight bend at the knees", "lats flared, maintaining a slight bend at the elbows."
- Difference: IFBB turns the feet out 30°, WNBF points the toes forward [S3][S6].

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | front | hip_width ≥ 0.30, lr_order true | [M 0.36..0.40, n=2] |
| Stance width | stance_ratio 0.45 | 0.00..0.65 | heels "up to 15 cm apart" [S3]; [M 0.34..0.55, n=2] |
| Knee bend | 5°, both legs | 0..15° | "knees unbent" [S3]; [M 3..10, n=2] |
| Foot placement | flat; toes out 30° (IFBB) or forward (WNBF) | ±15° [ESTIMATE] | [S3][S6]. Foot angle is hard to see from the front. |
| Torso rotation | 0° | twist ±10° [ESTIMATE] | "head and eyes facing the same direction as the body" [S3] |
| Abduction, each arm | 50° | 30..65° | "not touching or exaggerated wide" [S6]; [M 41..59, n=2] |
| Elbow flexion, each arm | 40° | 20..55° | "elbows slightly bent" [S3]; [M 37..43, n=2] |
| Forearm direction | down, 170° | ≥ 150° | [M 164..177, n=2] |
| Wrist height | -0.64 (beside the hips) | -0.85..-0.40 | [M -0.74..-0.50, n=2] |
| Hand position | fists, palms toward the body | n/a | [S3][S8] |
| Head direction | face the camera, chin level | head_yaw ±0.15 [ESTIMATE] | "head up" [S3] |
| Elbow span | 1.90 | 1.60..2.20 | [M 1.85..1.95, n=2] |

The camera cannot measure:
- Lat flare beyond what elbow_span shows [S6].
- "stomach in, chest out, shoulders back" [S3].
- Even, light tension. WNBF asks for no single-muscle flexing here [S6].
- A relaxed smile and shallow breathing [S14].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Arms pinned to the sides | abduction < 30° or elbow_span < 1.60 | "Lift your arms away from your sides." | "not touching" [S6] |
| Arms flared too wide | abduction > 65° | "Bring your arms in a little." | "exaggerated wide" [S6] |
| Feet too wide | stance_ratio > 0.65 | "Bring your heels closer together." | 15 cm limit [S3] |
| Body turned | twist > 10° | "Square your shoulders to the camera." | [S3] |
| Knees bent | knee_flex > 15° | "Straighten your legs." | "knees unbent" [S3] |
| Elbows locked straight | elbow_flex < 20° | "Soften your elbows a little." | "elbows slightly bent" [S3] |
| Shrugging | shrug < 0.80 | "Drop your shoulders down." | [S14] |
| Head down | nose more than 0.05 torso below the ear line [ESTIMATE] | "Chin up, eyes forward." | "head up" [S3] |
| Belly out | none | "Pull your stomach in." | "stomach in" [S3] |

Build-up:
1. Feet: Set your heels close together, toes slightly out.
2. Legs: Straighten your knees and lightly tense your thighs.
3. Hips: Point your hips straight at the camera.
4. Torso: Lift your chest and pull your stomach in.
5. Arms: Spread your lats so your arms hang away from your sides.
6. Hands: Make soft fists with your palms toward you.
7. Head: Lift your chin, look at the camera, and smile.
8. Finish: Widen your lats a little more and hold still.

## 2. Relaxed side (quarter turn, left or right side)

Called with the relaxed front. The first quarter turn to the right shows the left side, and the third shows the right side [S3][S6][S9].

Official text:
- IFBB [S3]: "Quarter Turn Right (left side to the judges): ... heels together, feet inclined outward at a 30° angle, knees together and unbent ... left arm hold down and slightly back from the centerline of the body ... right arm slightly bent at the elbow to the front of the body ... The positioning of the arms will cause the upper body to twist slightly to the left ... This is normal and must not be exaggerated."
- WNBF [S6]: "The torso should be upright. ... The upper body can be slightly twisted to display the rear shoulder and demonstrate a V-taper. Feet should be together or slightly staggered, feet flat on the stage."
- WNBF Australia [S8]: "Position one foot slightly in front of the other"; "Hips and eyes must be directed towards the side of the stage."
- Difference: IFBB puts the heels together, WNBF allows a slight stagger [S3][S6]. In bodybuilding the head stays in line with the body [S3][S8]. WNBF Men's Physique turns the head to the judges instead, so do not copy physique coaching here [S6].

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | left_side or right_side | hip_width ≤ 0.28 | [M 0.12..0.25, n=2] |
| Stance width | heels together, or a slight stagger | stagger ≤ 0.15 [ESTIMATE]; about 7.6 cm | [S3][S6]; [M stagger 0.00, n=2]. The 7.6 cm borrows the 3-inch (7.62 cm) WNBF Fit Body stagger [S6]. |
| Knee bend | 4°, both legs | 0..15° | "knees together and unbent" [S3]; [M 3.5..4.1, n=2] |
| Foot placement | both feet flat, toes out 30° (IFBB) | n/a | [S3][S6]. heel_lift is unreliable here because the far foot points at the camera. |
| Torso rotation | twist 15° toward the camera | 0..35° | "twist slightly" [S3]; [M 14..17°, 2D model, n=2]. The 35° bound is the WNBF Figure and Men's Physique limit [S6], borrowed [ESTIMATE]. |
| Abduction, near arm | 27° | 10..40° | "slightly back from the centerline" [S3]; [M 23..32, n=2] |
| Elbow flexion, near arm | 25° | 5..40° | [M 20..30, n=2] |
| Far arm | slightly bent, in front of the body | elbow_flex 5..40° [ESTIMATE] | [S3] |
| Forearm direction | down | ≥ 150° | [M 161..179, n=2] |
| Wrist height, near arm | -1.03 (beside the thigh) | -1.15..-0.85 | [M -1.03..-1.03, n=2] |
| Hand position | fists | n/a | [S3][S8] |
| Head direction | in line with the body, eyes to the side | head turned less than 20° toward the camera [ESTIMATE] | [S3][S8] |

The camera cannot measure:
- How much of the rear shoulder shows [S6].
- "stomach in, chest out, shoulders back" [S3].
- Even tension without single-muscle flexing [S6].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Upper body turned too far to the camera | twist > 35° or shoulder_width > 0.65 | "Turn your shoulders back to the side." | "must not be exaggerated" [S3] |
| Hips not turned (three-quarter stance) | hip_width > 0.28 | "Turn your hips fully to the side." | [S8] |
| Head turned to the camera | head_yaw toward the camera > 0.30 [ESTIMATE] | "Look straight ahead, along your body." | [S3][S8] |
| Knees bent | knee_flex > 15° | "Straighten your knees." | [S3] |
| Feet staggered too far | toe offset > 7.6 cm [ESTIMATE] | "Bring your feet closer together." | [S3][S6] |
| Arms pinned or flared | near-arm abduction < 10° or > 40° | "Let your arms hang naturally." | [S6] |
| Leaning | lean beyond ±10° of calibration [ESTIMATE] | "Stand tall and upright." | "torso should be upright" [S6] |
| Belly out | none | "Pull your stomach in." | [S3] |

Build-up:
1. Feet: Turn a quarter to your right and set your heels together.
2. Legs: Straighten your knees and keep them together.
3. Hips: Point your hips at the side wall.
4. Torso: Lift your chest and turn your upper body slightly toward the camera.
5. Arms: Let the near arm hang slightly back and the far arm slightly forward.
6. Hands: Make soft fists.
7. Head: Keep your head in line with your body.
8. Finish: Tighten your stomach and hold still.

## 3. Relaxed back (quarter turn back)

Called with the relaxed front [S4][S5][S6][S9].

Official text:
- IFBB [S3]: "Quarter Turn Back: Erect, tense stance, head and eyes facing the same direction as the body, heels inline and up to 15 cm apart, feet inclined outward at a 30° angle, knees unbent, ... both arms hold down and at the side along the centerline of the body, elbows slightly bent, ... hands clenched into fists."
- WNBF [S6]: "Lats should be spread to display a V-taper. Feet should be together or slightly apart, feet flat on the stage."
- WNBF Australia [S8]: "Feet should be aligned and not offset to any degree"; "Arms should be kept flared to the sides and lats open to highlight the athlete's X frame."

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | back | hip_width ≥ 0.30, lr_order false | [M 0.39, lr_order false, n=1] |
| Stance width | stance_ratio 0.40 | 0.00..0.65 | "up to 15 cm apart" [S3]; [M 0.40, n=1] |
| Knee bend | 2°, both legs | 0..15° | "knees unbent" [S3]; [M 1.5..1.6, n=1] |
| Foot placement | flat, level, toes out 30° (IFBB) | no front-back offset | [S3][S8] |
| Torso rotation | 0° | twist ±10° [ESTIMATE] | [S3] |
| Abduction, each arm | 35° | 25..55° | [M 33..37, n=1]; "not touching or exaggerated wide" [S6] |
| Elbow flexion, each arm | 47° | 25..60° | "elbows slightly bent" [S3]; [M 44..51, n=1] |
| Forearm direction | down | ≥ 150° | [M 166..170, n=1] |
| Wrist height | -0.80 | -0.95..-0.65 | [M -0.82..-0.79, n=1] |
| Hand position | fists | n/a | [S3] |
| Head direction | face the back wall, chin level | head_yaw ±0.15 [ESTIMATE] | [S3] |
| Elbow span | 1.75 | 1.60..2.10 | [M 1.74, n=1] |

The camera cannot measure:
- Lat spread width beyond elbow_span [S6][S8].
- "stomach in, chest out, shoulders back" [S3].
- Glute and hamstring tension.

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Lats closed, arms pinned | abduction < 25° or elbow_span < 1.60 | "Spread your lats, arms away." | [S6][S8] |
| Arms flared too wide | abduction > 55° | "Bring your arms in a little." | "exaggerated wide" [S6] |
| One foot ahead of the other | knee_flex differs by > 10° between legs [ESTIMATE] | "Line your feet up evenly." | "not offset" [S8] |
| Feet too wide | stance_ratio > 0.65 | "Bring your heels closer together." | 15 cm limit [S3] |
| Head turned or dropped | head_yaw beyond ±0.15 [ESTIMATE] | "Head straight, chin level." | [S3] |
| Shrugging | shrug < 0.80 | "Drop your shoulders down." | [S14] |
| Knees bent | knee_flex > 15° | "Straighten your legs." | [S3] |

Build-up:
1. Feet: Turn your back to the camera with your heels close and level.
2. Legs: Straighten your knees and tense your hamstrings lightly.
3. Hips: Keep your hips square to the back wall.
4. Torso: Lift your chest and keep your back tall.
5. Arms: Spread your lats so your arms hang away from your sides.
6. Hands: Make soft fists.
7. Head: Keep your head straight with your chin level.
8. Finish: Widen your back a little more and hold still.

## 4. Front double biceps

Called by every federation [S1][S4][S5][S6]. It is the first pose in the IFBB elimination round [S1].

Official text:
- IFBB [S1]: "Standing face front to the judges, with one leg 40-50 cm forward and to the side, the competitor will raise both arms to shoulder level and bend them at the elbows. The hands should be clenched and turned down so as to cause a contraction of the biceps and forearm muscles". The judge then checks "a full, peaked development" and the "forearms, deltoids, pectorals, pec-delt tie-ins, abdominals, thighs, and calves".
- WNBF [S6]: "Elbows positioned wide, fists held at or above ear level"; "Elbows and lats spread forward"; legs "may display one leg, or pose legs symmetrically". Tip: "Keep knees slightly bent & angle feet outward".
- WNBF Australia [S8]: feet "about shoulder-width apart. Note that placing one leg forward is also permitted"; "vacuum poses are also permitted".
- Difference: IFBB requires one leg forward and to the side. WNBF and coaches also accept symmetric feet [S6][S8][S13]. John Romano puts the "heels ... close together" [S10].
- Difference: IFBB asks the athlete to "contract as many other muscles as possible" [S1]. Breaking Muscle says "Other than your quads, forearms and biceps, no other muscles need to be flexed" [S12].

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | front | hip_width ≥ 0.30, lr_order true | [M 0.33..0.35, n=3] |
| Stance width | stance_ratio 0.95 | 0.60..1.40 [ESTIMATE] | IFBB "40-50 cm forward and to the side" [S1]; shoulder-width [S8][S13]; [M 0.85..1.05, n=3]. The wide band admits the coaching styles. |
| Front knee bend | 15° on the bent leg, 5° on the other | 0..30° | "knees slightly bent" [S6]; [M 14..21 and 1..11, n=3] |
| Foot placement | toes turned out about 45°; with IFBB, one foot forward and out | ±15° [ESTIMATE] | 45° [S12]; "slightly outwards" [S8]. The forward step needs depth, which a single camera does not see well. |
| Torso rotation | 0° | twist ±10° [ESTIMATE] | "face front" [S1] |
| Abduction, each arm | 97° | 80..112° | "shoulder level" [S1]; "slightly higher than parallel" [S13]; [M 88..102, n=3] |
| Elbow height, each arm | +0.05 | -0.10..+0.20 | "just above parallel" [S10]; [M -0.01..+0.10, n=3] |
| Elbow flexion, each arm | 115° | 97..131° | [M 107..121, n=3] |
| Forearm direction | up and slightly in, 30° from vertical | 12..50° | [M 22..40, n=3] |
| Wrist height | at or above the nose: wrist_vs_nose +0.10 | ≥ -0.05 | "at or above ear level" [S6]; [M +0.05..+0.13, n=3] |
| Hand position | fists, curled in and down | n/a | "clenched and turned down" [S1]; "curl your fists inward" [S13] |
| Head direction | face the camera, smile | head_yaw ±0.15 [ESTIMATE] | [S14] |
| Elbow span | 2.35 | ≥ 2.15 | [M 2.28..2.46, n=3] |
| Upper arms forward of the body | 10..20° | needs depth | "Aim your elbows roughly 10 to 20 degrees in front of you" [S12] |

The camera cannot measure:
- Biceps peak and contraction, and the small wrist turn that fills the gap between biceps and delt [S10].
- Lats "spread forward" [S6].
- Flexed quads and calves [S10][S14].
- The abdominal style: "sternum lifted and abs stretched", or "sternum crunched down with abs flexed" [S10].
- A smile and shallow breathing [S14].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Elbows too low | elbow_height < -0.10 or abduction < 80° | "Raise your elbows to shoulder height." | [S10][S1] |
| Elbows too high | elbow_height > +0.20 or abduction > 112° | "Lower your elbows a little." | [S10] |
| Elbows too closed in, fists low | wrist_vs_nose < -0.05 or forearm_angle > 50° | "Bring your fists up to your ears." | [S10][S6] |
| Arms pulled too far back | needs depth (elbows behind the shoulder line) | "Bring your elbows slightly forward." | [S13][S12] |
| Feet too far apart | stance_ratio > 1.40 | "Bring your feet a little closer." | [S10] |
| Dead legs | knee_flex 0° on both legs (partial sign only) | "Flex your quads and calves." | [S10][S13][S14] |
| Shrugging | shrug < 0.80 | "Drop your shoulders, stay wide." | [S13][S14] |
| Leaning forward | nose drops toward the shoulder line, or lean > 10° past calibration [ESTIMATE] | "Chest up, stand tall." | [S13] |
| Uneven arms | abduction differs by > 15°, or elbow_height by > 0.10, between arms [ESTIMATE] | "Match your arms evenly." | [ESTIMATE] |
| Visible strain from over-flexing | none | "Relax your face, keep breathing." | [S12][S14] |

Build-up:
1. Feet: Set your feet about shoulder width, toes turned out.
2. Legs: Bend your knees slightly and flex your quads and calves.
3. Hips: Point your hips straight at the camera.
4. Torso: Lift your chest and tighten your waist.
5. Arms: Spread your lats, then raise your elbows to shoulder height.
6. Hands: Close your fists and curl them toward your head.
7. Head: Look at the camera and smile.
8. Finish: Squeeze both biceps and hold.

## 5. Front lat spread

Called by IFBB in Round 1 and the finals [S1], and by IFBB Pro, NPC, and WNBF [S4][S5][S6].

Official text:
- IFBB [S1]: "Standing face front to the judges, with the legs and feet in-line and up to 15 cm apart, the competitor will place the open hands, or clenched fists, against, or gripping, the lower waist or obliques and will expand the latissimus muscles." It is "strictly forbidden for the competitor to pull up on the posing trunks".
- NPC [S5]: competitors must not alter the suit "by pulling up the sides during Front and Rear Lat Spreads."
- WNBF [S6]: "Hands/fists press the obliques inward, anchor on the rib cage"; "Elbows & lats spread fully forward"; "Chest held high without shrugging shoulders". Tip: "Don't lean backwards."
- Difference: BarBend says a good front lat spread lets the athlete "lean back slightly" [S16]. WNBF says not to lean back [S6]. Follow WNBF.

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | front | hip_width ≥ 0.30, lr_order true | [M 0.37..0.39, n=2] |
| Stance width | stance_ratio 0.50 | 0.30..0.85 | "in-line and up to 15 cm apart" [S1]; "shoulder-width apart or narrower" [S8]; [M 0.49..0.75, n=2] |
| Knee bend | 5°, both legs | 0..20° | [M 4..11, n=2] |
| Foot placement | feet level ("in-line"), toes out 45° | no front-back offset | [S1]; 45° [S12] |
| Torso rotation | 0° | twist ±10° [ESTIMATE] | "face front" [S1] |
| Abduction, each arm | 51° | 39..63° | [M 49..53, n=2] |
| Elbow height, each arm | -0.30 | -0.41..-0.19 | [M -0.31..-0.29, n=2] |
| Elbow flexion, each arm | 102° | 89..116° | [M 99..106, n=2] |
| Forearm direction | down and in, 128° | 115..141° | [M 125..131, n=2] |
| Wrist height | -0.57 (lower waist) | -0.70..-0.44 | "lower waist or obliques" [S1]; [M -0.60..-0.54, n=2] |
| Hand position | fists or open hands on the lower waist, thumbs behind | wrist_gap 0.65..0.95 | [S1]; "Grasp back of hips with thumbs and fist" [S15]; [M 0.79, n=2] |
| Head direction | face the camera, smile | head_yaw ±0.15 [ESTIMATE] | [S14] |
| Elbow span (lat width) | 2.00 | ≥ 1.85 | [M 1.94..2.07, n=2] |
| Elbows forward of the body | "Elbow further forward than abdomen" | needs depth | [S15] |

The camera cannot measure:
- Real lat expansion, with the shoulders pulled "down and forward" [S13][S6].
- "Chest held high" and rib cage lift [S6][S8].
- Pecs flexed [S12].
- Waist control and flexed quads [S13].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Elbows pulled back | needs depth. Untested 2D sign: upper arm looks full length [ESTIMATE] | "Drive your elbows forward." | [S13][S15][S6] |
| Shrugging | shrug < 0.80 | "Drop your shoulders down." | [S6][S15][S14] |
| Hands too high or too low | wrist_height outside -0.70..-0.44 | "Put your hands on your lower waist." | [S1] |
| Pulling up the trunks | wrist_height < -0.85 (hands at the hip crease) [ESTIMATE] | "Take your hands off your trunks." | [S1][S5] |
| Feet too wide or staggered | stance_ratio > 0.85, or knee_flex differs by > 10° [ESTIMATE] | "Set your feet close and level." | [S1] |
| Leaning back | lean more than 8° away from the camera, past calibration [ESTIMATE] | "Stand tall, don't lean back." | [S6] |
| Hunching forward | lean > 10° toward the camera, past calibration [ESTIMATE] | "Lift your chest up." | [S13] |
| Narrow spread | elbow_span < 1.85 | "Spread your lats wider." | [S6] |
| Loose waist, dead legs | none | "Tighten your waist, flex your quads." | [S13] |

Build-up:
1. Feet: Set your feet level and close, toes turned out.
2. Legs: Flex your quads with your knees almost straight.
3. Hips: Point your hips straight at the camera.
4. Torso: Lift your chest and pull your shoulders down.
5. Arms: Bring your elbows forward and out to the sides.
6. Hands: Set your fists on your lower waist, thumbs behind.
7. Head: Look at the camera and smile.
8. Finish: Press into your waist and spread your lats wide.

## 6. Side chest (left or right)

Called by every federation [S1][S4][S5][S6]. IFBB lets the athlete pick the side [S1]. OCB calls both sides [S9].

Official text:
- IFBB [S1]: "The competitor may choose either side for this pose, in order to display the 'better' arm. He will stand with his left or right side towards the judges and will bend the arm nearest the judges to a right-angle position, with the fist clenched and, with the other hand, will grasp the wrist. The leg nearest the judges will be bent at the knee and will rest on the toes." He then expands the chest, presses the front arm upward, and contracts the leg biceps and calves.
- WNBF [S6]: "Away hand is placed on the wrist facing judges. Pull upward to flex the bicep, forearm, and isolate the medial deltoid"; "Chest should be held high with the away pec flexed and striated"; "Both legs should be bent. The heel facing judges should be spiked displaying the calf." Tip: "turn appropriately to display V-taper."
- WNBF Australia [S8]: "Place one hand on top of the other arm's forearm" (a forearm grip, not a wrist grip); "Maintain a slight twist".

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | left_side or right_side, chest turned partly to the camera | hip_width ≤ 0.28 | [M 0.13..0.17, n=3] |
| Stance width | thighs pressed together | stagger ≤ 0.18 | "You want your legs together" [S12]; [M stagger 0.02..0.08, n=3] |
| Front (near) knee bend | 64° | 50..77° | "bent at the knee" [S1]; [M 60..67, n=3] |
| Rear (far) knee bend | 22° | 5..45° | "Both legs should be bent" [S6]; [M 15..35, n=3] |
| Foot placement | near heel up, far foot flat | near heel_lift ≥ 0.30, far ≤ 0.25 | [S1][S6]; [M near 0.41..0.82, far 0.06..0.13, n=3] |
| Torso rotation | hips side-on, chest turned about 20° toward the camera | twist 10..40°; shoulder_width 0.42..0.65 | "slight twist" [S8]; [M twist 13..29°, 2D model; shoulder_width 0.48..0.57, n=3] |
| Abduction, near arm | upper arm close to the trunk, 5° in the image | 0..20° | [M 3..8, n=3] |
| Elbow flexion, near arm | 90° | 70..115° | "right-angle position" [S1]; [M 73..111, n=3]. Side views foreshorten this angle. |
| Forearm direction, near arm | across the body, about horizontal (100°) | 83..121° | [M 93..111, n=3] |
| Wrist height, near arm | -0.62 (lower chest) | -0.80..-0.47 | [M -0.70..-0.57, n=3] |
| Hand position | near fist clenched, far hand grips the near wrist | wrist_gap ≤ 0.40 | [S1]; [M 0.23..0.31, n=3] |
| Head direction | face the camera, smile | head_yaw toward the camera [ESTIMATE] | All 3 reference photos face the camera [M]; [S14] |

The camera cannot measure:
- Chest expansion and "the arch of the rib cage" [S1].
- The upward press of the front arm and the biceps contraction [S1][S6].
- The flexed far pec [S6][S15].
- Hamstring and calf tension. Breaking Muscle says not to flex the front hamstring, which presses against the rear leg to show fullness [S12].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Front heel down | near heel_lift < 0.30 | "Rise onto your front toes." | [S1][S6] |
| Front knee straight | near knee_flex < 50° | "Bend your front knee more." | [S1] |
| Legs apart | stagger > 0.18 | "Squeeze your thighs together." | [S12][S15][S16] |
| Front arm angle wrong | near elbow_flex outside 70..115° | "Bend your front arm to ninety degrees." | [S1][S13] |
| Pure profile, no twist | twist < 10°, or shoulder_width < 0.42 | "Turn your chest toward the camera." | [S6][S12][S15] |
| Turned square to the camera | hip_width > 0.28 | "Turn your hips back to the side." | [S1] |
| Grip lost | wrist_gap > 0.40 | "Grab your front wrist." | [S1] |
| Shrugging | shrug < 0.80 | "Drop your shoulders down." | [S13] |
| Chest collapsed | none | "Lift your chest high." | [S13][S6] |
| Loose rear arm | none | "Flex your back arm too." | [S13] |

Build-up:
1. Feet: Turn your side to the camera and rise onto your front toes.
2. Legs: Bend both knees and press your thighs together.
3. Hips: Keep your hips facing the side wall.
4. Torso: Lift your rib cage and turn your chest toward the camera.
5. Arms: Bend your front arm to a right angle across your body.
6. Hands: Make a fist and grab that wrist with your back hand.
7. Head: Look at the camera and smile.
8. Finish: Press your front arm up and squeeze your chest and calf.

## 7. Back double biceps

Called by every federation [S1][S4][S5][S6]. It is in the IFBB elimination round [S1].

Official text:
- IFBB [S1]: "Standing with his back to the judges, the competitor will bend the arms and wrists as in the Front Double Biceps pose, and will place one foot back, resting on the toes. He will then contract the arm muscles as well as the muscles of the shoulders, upper and lower back, thigh and calf muscles."
- WNBF [S6]: "Fists held at or above ear level"; "Arms/elbows rotate toward the judges as much as possible"; "One foot should be back, with the calf spiked and displayed." Tip: "Don't lean too far backward toward the judges ... or step too far back with one leg".
- WNBF Australia [S8]: feet "about shoulder-width apart. Note that placing one leg back is also permitted."
- Difference: John Romano says "pull your elbows back as you rotate your elbows and your fists coming to a stop just above your ears" [S11]. Breaking Muscle says "do not draw your elbows back" [S12], and BarBend says not to "pinch their shoulder blades together" [S16]. WNBF rotates the elbows toward the judges [S6]. This spec follows WNBF.

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | back | hip_width ≥ 0.30, lr_order false | [M 0.32..0.39; lr_order false in 3 of 3] |
| Stance width | stance_ratio 1.10 | 0.80..1.40 | [M 1.04..1.15, n=3] |
| Knee bend | 25° on the back leg, 10° on the other | 0..43° | [M 13..33 and 7..18, n=3] |
| Foot placement | one foot back on its toes, the other flat | see note | [S1][S6]. In each of the 3 back photos one foot read heel_lift 0.52..0.94 and the other -0.21..0.12 [M]. Treat this as a hint until it is tested on webcam video. |
| Torso rotation | 0°, square to the back wall | twist ±10° [ESTIMATE] | [S1] |
| Trunk lean | slight lean back toward the camera | 0..10° past calibration [ESTIMATE] | "a slight lean is great, but don't overdo it" [S13]; [S16] |
| Abduction, each arm | 96° | 85..110° | "as in the Front Double Biceps" [S1]; [M 95..100, n=3] |
| Elbow height, each arm | +0.06 | -0.07..+0.20 | "elbows slightly higher than the shoulders" [S16]; [M +0.03..+0.10, n=3] |
| Elbow flexion, each arm | 111° | 84..132° | [M 94..122, n=3] |
| Forearm direction | up, 28° from vertical | 3..53° | [M 13..43, n=3] |
| Wrist height | wrist_height +0.43 | +0.29..+0.58 | "at or above ear level" [S6]; "just above your ears" [S11]; [M +0.39..+0.48, n=3] |
| Hand position | fists | n/a | [S1] |
| Head direction | turned to one side | head_yaw beyond ±0.30 [ESTIMATE] | "TURN YOUR HEAD! Doesn't matter which side" [S11]; [S15] |
| Elbow span | 2.35 | ≥ 2.10 | [M 2.23..2.46, n=3] |

The camera cannot measure:
- Back width and density, the spread of the lats, and the "Christmas tree" [S11].
- Wrist position on the biceps. Dorian Yates said "it took me many, many hours to perfect" and that he had to work on "the wrist position" [S21].
- Flexed hamstrings, glutes, and calves [S13][S15].
- Core bracing with shallow breaths [S13].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Elbows too low | elbow_height < -0.07 or abduction < 85° | "Lift your elbows above your shoulders." | [S16][S1] |
| Fists low, forearms flared | wrist_height < +0.29 or forearm_angle > 53° | "Bring your fists up to your ears." | [S6][S11] |
| No calf shown | no foot reads heel_lift ≥ 0.40 [ESTIMATE] | "Step one foot back, heel up." | [S1][S6] |
| Step too long | stance_ratio > 1.40, or back knee_flex > 43° | "Shorten your back step." | [S6] |
| Leaning too far back | lean > 15° toward the camera, past calibration [ESTIMATE] | "Stand taller, less lean back." | [S6][S13] |
| Head facing straight back | head_yaw within ±0.30 [ESTIMATE] | "Turn your head to one side." | [S11][S15] |
| Shrugging | shrug < 0.80 | "Drop your shoulders, spread your back." | [S13] |
| Shoulder blades pinched | needs depth | "Keep your back wide and open." | [S16][S12] |
| Dead legs | none | "Flex your hamstrings and glutes." | [S13][S15] |

Build-up:
1. Feet: Turn your back to the camera and step one foot back onto its toes.
2. Legs: Bend your knees slightly and flex your hamstrings and calves.
3. Hips: Keep your hips square to the back wall.
4. Torso: Lift your chest and lean back only slightly.
5. Arms: Raise your elbows just above shoulder height.
6. Hands: Make fists and bring them up to ear level.
7. Head: Turn your head to one side.
8. Finish: Flex your arms and spread your whole back.

## 8. Back lat spread

Called by IFBB in Round 1 and the finals [S1], and by IFBB Pro, NPC, and WNBF [S4][S5][S6].

Official text:
- IFBB [S1]: "Standing with his back to the judges, the competitor will place his hands on his waist with his elbows kept wide, with the legs and feet in-line and up to 15 cm apart. He will then contract the latissimus dorsi as wide as possible. The competitor should make an effort to display the opposite calf to that which was displayed during the back double biceps pose". Pulling up the trunks is "strictly forbidden".
- WNBF [S6]: "Hands/fists press the obliques inward, anchor on the rib cage"; "Elbows & lats spread fully forward"; "Chest held high without shrugging shoulders"; "spiking one foot displaying the calf".
- WNBF Australia [S8]: "Stay on both feet at the same level, about shoulder-width apart. Alternatively, place one foot behind and spike the calf."
- Phil Heath [S20]: feet "hip-width apart"; "raise the back heel slightly"; "drop the shoulders"; "roll the shoulder blades forward and outward".

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | back | hip_width ≥ 0.30, lr_order false | [M 0.38..0.41; lr_order false in 2 of 2] |
| Stance width | stance_ratio 0.70 (IFBB in-line); up to 1.40 with a WNBF step back | 0.40..0.90 (IFBB) | "up to 15 cm apart" [S1]; [M 0.69 IFBB photo, 1.42 WNBF photo] |
| Knee bend | 12° | 0..35° | [M 7..25, n=2] |
| Foot placement | one calf flexed, the opposite of the back double biceps calf | track the side used in pose 7 | [S1][S6][S20] |
| Torso rotation | 0° | twist ±10° [ESTIMATE] | [S1] |
| Abduction, each arm | 42° | 28..54° | [M 38..44, n=2] |
| Elbow height, each arm | -0.34 | -0.45..-0.23 | [M -0.35..-0.33, n=2] |
| Elbow flexion, each arm | 97° | 79..113° | [M 89..103, n=2] |
| Forearm direction | down and in, 125° | 110..140° | [M 120..131, n=2] |
| Wrist height | on the waist; do not score | wrist_vis read 0.09..0.26 | "hands on his waist" [S1]; [M n=2] |
| Hand position | fists or hands on the waist | n/a | [S1][S20] |
| Head direction | straight, or turned to one side | n/a | ExRx lists "Turn head" under rear poses [S15] |
| Elbow span (lat width) | 1.77 | ≥ 1.65 | [M 1.74..1.80, n=2] |

The camera cannot measure:
- Lat width and the shoulder blades rolling forward and outward [S20].
- Chest lift. Human Kinetics warns that a caved chest shrinks the silhouette "even on the rear lat spread pose" [S14].
- Glute, hamstring, and calf tension [S13].
- A small belly push is fine from behind, because the judges do not see it [S14].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Elbows pulled back | needs depth | "Drive your elbows forward and wide." | [S13][S6] |
| Narrow spread | elbow_span < 1.65 | "Spread your lats wider." | [S1][S6] |
| Shrugging | shrug < 0.80 | "Drop your shoulders down." | [S6][S20] |
| Hands too high or too low | elbow_height outside -0.45..-0.23 (wrists are hidden) | "Put your hands on your waist." | [S1] |
| Same calf as the back double biceps | raised-heel side equals the side used in pose 7 | "Show your other calf now." | [S1] |
| No calf flexed (WNBF) | no foot reads heel_lift ≥ 0.40 [ESTIMATE] | "Raise your back heel and squeeze." | [S6][S20] |
| Pulling up the trunks | elbow_height < -0.50 (hands low on the hips) [ESTIMATE] | "Take your hands off your trunks." | [S1][S5] |
| Hunched forward | none reliable | "Lift your chest, spread wide." | [S13][S14] |
| Dead legs | none | "Flex your hamstrings and glutes." | [S13] |

Build-up:
1. Feet: Keep your back to the camera with your feet close and level.
2. Legs: Flex the calf you did not show in the double biceps.
3. Hips: Keep your hips square to the back wall.
4. Torso: Push your chest forward and drop your shoulders.
5. Arms: Bring your elbows forward and wide.
6. Hands: Set your fists on your waist.
7. Head: Turn your head to one side, or keep it straight.
8. Finish: Roll your shoulder blades out and spread your lats.

## 9. Side triceps (left or right)

Called by IFBB in Round 1 and the finals [S1], and by IFBB Pro, NPC, and WNBF [S4][S5][S6]. IFBB lets the athlete pick the side [S1]. OCB calls both sides [S9].

Official text:
- IFBB [S1]: "The competitor may choose either side for this pose so as to show the 'better' arm. He will stand with his left or right side towards the judges and will place both arms behind his back, either linking his fingers or grasping the front arm by the wrist with his rear hand. The leg nearest the judges will be bent at the knee and the foot will rest flat on the floor. The leg farthest to the judges will be bent at the knee and the foot resting on the toes."
- WNBF [S6]: "Away hand reaches behind grasping the hand or wrist of the arm facing judges"; "Arm facing judges is fully extended flexing the triceps"; "Both legs should be bent. The heel facing judges should be spiked displaying the calf." Tip: "twisting to some degree to maintain V-taper."
- WNBF Australia [S8]: "Ensure the front upper arm is against your side"; "Direct knees toward the side of the stage."
- Difference: IFBB keeps the near foot flat and puts the far foot on its toes [S1]. WNBF spikes the near heel [S6], and Breaking Muscle puts the athlete "up on the ball of your front foot" [S12]. The engine needs a federation setting for this row. The IFBB 2019 photo matches the IFBB text: near heel_lift 0.07, far heel_lift 0.68 [M n=1].
- Difference: ExRx says "Bend elbow slightly" [S15]. WNBF says "fully extended" [S6], and StrengthLog says "Straighten and lock the arm" [S13].

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | left_side or right_side | hip_width ≤ 0.28 | [M 0.12..0.26, n=3] |
| Stance width | knees close; IFBB staggers the feet front to back | stagger 0.00..0.60 | "legs bent and packed together" [S12]; [M stagger 0.06..0.50, n=3; both IFBB photos 0.47..0.50] |
| Near knee bend | 45° | 20..70° | "bent at the knee" [S1]; [M 30..61, n=3] |
| Far knee bend | 50° | 33..67° | [S1]; [M 43..57, n=3] |
| Foot placement | IFBB: near foot flat, far heel up. WNBF: near heel up. | per federation: flat ≤ 0.25, up ≥ 0.30 heel_lift [ESTIMATE] | [S1][S6]; [M IFBB photo 0.07 and 0.68] |
| Torso rotation | hips side-on, chest turned about 20° toward the camera | twist 5..45°; shoulder_width 0.42..0.70 | "twisting to some degree" [S6]; [M twist 9..37°, 2D model; shoulder_width 0.49..0.61, n=3] |
| Abduction, near arm | 9° (arm along the side) | 0..22° | "front upper arm is against your side" [S8]; [M 6..12, n=3] |
| Elbow flexion, near arm | 10° | 0..23° | "fully extended" [S6]; [M 9..13, n=3] |
| Forearm direction, near arm | straight down | ≥ 160° | [M 173..179, n=3] |
| Wrist height, near arm | -1.03 | -1.15..-0.90 | [M -1.06..-1.02, n=3] |
| Hand position | far hand behind the back on the near wrist or fingers | far wrist_vis < 0.30 | [S1][S6]; [M far wrist_vis 0.01..0.03, n=3] |
| Head direction | face the camera, smile | head_yaw toward the camera [ESTIMATE] | All 3 reference photos face the camera [M]; [S14] |

The camera cannot measure:
- Triceps contraction from pressing the front arm against the rear hand. Breaking Muscle compares it to "an isometric lateral raise" [S12].
- Over-pressing. StrengthLog warns that "Smashing your triceps too hard flattens the arm" [S13].
- Chest raised and abs controlled. Human Kinetics names the "pooch belly" in this pose [S14].
- Breathing. WNBF keeps "air filled lungs" [S6], and WNBF Australia says "Exhale" [S8]. Let the user choose.

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Front arm bent | near elbow_flex > 23° | "Straighten your front arm fully." | [S6][S13] |
| Front arm drifting away from the body | near abduction > 22°, or near forearm_angle < 160° | "Keep your arm tight to your side." | [S13][S8] |
| Rear hand not behind the back | far wrist_vis > 0.50 [ESTIMATE] | "Reach behind and grab your wrist." | [S1] |
| Pure profile, no twist | twist < 5°, or shoulder_width < 0.42 | "Twist your chest toward the camera." | [S6][S12] |
| Legs straight | knee_flex < 20° on either leg | "Bend both knees slightly." | [S1][S6] |
| Wrong foot raised for the federation | heel_lift pattern does not match the federation row | "Front foot flat, back heel up." (IFBB) | [S1][S6] |
| Belly out | none | "Pull your stomach in." | [S14][S13] |
| Crunching forward | lean > 10° toward the camera, past calibration [ESTIMATE] | "Chest up, stand tall." | [S13] |

Build-up:
1. Feet: Turn your side to the camera and set your feet for your federation.
2. Legs: Bend both knees and press your legs together.
3. Hips: Keep your hips facing the side wall.
4. Torso: Lift your chest and twist it slightly toward the camera.
5. Arms: Straighten your front arm down along your side.
6. Hands: Reach behind your back and grab your front wrist.
7. Head: Look at the camera and smile.
8. Finish: Press your arm into your hand and tighten your stomach.

## 10. Abdominals and thighs

Called by every federation [S1][S4][S5][S6]. It is in the IFBB elimination round [S1].

Official text:
- IFBB [S1]: "Standing face front to the judges, the competitor will place both arms behind the head and will place one leg forward. He will then contract the abdominal muscles by 'crunching' the trunk slightly forward. At the same time, he will contract the thigh muscles of the front leg."
- WNBF [S6]: "Hands behind head flaring the lats"; "Quads may be positioned together or one leg forward"; "Athletes are allowed to flex one leg then transition to flexing the other leg if they choose." Tip: "Keep your elbows wide and flex your biceps while posing."
- WNBF Australia [S8]: "Either keep both arms up with hands behind the head or place one hand behind the head and the other on the hips."
- Difference: WNBF wants flexed biceps [S6]. Breaking Muscle says "Don't overemphasize flexing your arms or lats" [S12].

| Quantity | Target | Pass band | Basis |
|---|---|---|---|
| Facing | front | hip_width ≥ 0.30, lr_order true | [M 0.33..0.34, n=3] |
| Stance width | stance_ratio 0.35 with one leg forward | 0.20..1.20 | "one leg forward" [S1]; [M 0.28..1.07, n=3] |
| Front knee bend | 15° on the forward leg, near 0° on the other | 0..32° | [M 13..22 and 2..4, n=3] |
| Foot placement | back foot out about 45°, front leg forward with the toe pointed | needs depth | [S12]; "one leg forward" [S1] |
| Torso rotation | 0° | twist ±10° [ESTIMATE] | "face front" [S1] |
| Trunk flexion | "crunching the trunk slightly forward" | torso length 85..100% of calibration [ESTIMATE] | [S1]. Single-image lean cannot see this crunch [M]. |
| Abduction, each arm | 155° | 130..180° | [M 139..171, n=3] |
| Elbow height, each arm | +0.35 | ≥ +0.20 | [M +0.29..+0.38, n=3] |
| Elbow flexion, each arm | 115° | 98..138° | [M 108..128, n=3] |
| Forearm direction | about horizontal, behind the head | 65..115° | [M 75..105, n=3] |
| Wrist height | behind the head; do not score | wrist_vis read 0.00..0.02 | [S1]; [M n=3] |
| Hand position | both hands behind the head, fingers interlocked | n/a | [S1]; "fingers interlocked" [S13] |
| Head direction | face the camera, head up | head_yaw ±0.15 [ESTIMATE] | "Pulling your head down with your hands" is a fault [S13] |
| Elbow span | 1.55 | ≥ 1.30 | "Keep your elbows wide" [S6]; [M 1.33..1.84, n=3] |

The camera cannot measure:
- Abdominal contraction. StrengthLog says to exhale fully and crunch [S13], and warns against crushing the torso [S13].
- Flexed quads of the front leg and a held rear leg [S1][S13].
- Lat flare and serratus [S6][S12].
- Breath control. "Gasping for air" makes the stomach pop out [S13].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Elbows pinched forward | elbow_span < 1.30 | "Open your elbows wide." | [S6] |
| Hands not behind the head | a wrist is visible (wrist_vis > 0.50) in front of the face [ESTIMATE] | "Put both hands behind your head." | [S1] |
| No leg forward (IFBB) | knee_flex differs by < 5° and stance looks symmetric [ESTIMATE] | "Step one leg forward." | [S1] |
| Crunching too hard | torso length < 85% of calibration [ESTIMATE] | "Crunch less, stay tall." | [S13] |
| Pulling the head down | nose drops more than 0.10 torso below calibration [ESTIMATE] | "Keep your head up." | [S13] |
| Rear leg relaxed | none | "Hold your back leg tight." | [S13] |
| Front leg not flexed | none | "Flex your front quad." | [S1] |
| Midsection released | none | "Breathe out and hold tight." | [S13][S16] |

Build-up:
1. Feet: Step one foot forward with the toe pointed.
2. Legs: Flex the quad of your front leg.
3. Hips: Point your hips straight at the camera.
4. Torso: Breathe out and crunch your abs slightly forward.
5. Arms: Lift your arms and open your elbows wide.
6. Hands: Lock your fingers behind your head.
7. Head: Keep your head up and look at the camera.
8. Finish: Squeeze your abs and front thigh together.

## 11. Most muscular (favorite variant)

Called by IFBB Pro and NPC as the eighth pose [S4][S5]. IFBB 2026 men's bodybuilding does not call it [S1]. WNBF lists a hands-on-hips and a crab most muscular in the men's muscularity round [S6]. OCB calls "Hands on Thighs/Hips Most Muscular" and "Crab most muscular" [S9].

Official text:
- IFBB Pro and NPC [S4][S5]: name only.
- WNBF Australia [S8]: "Strike your favourite 'Most Muscular' pose."
- Greg Merritt [S17]: "The head judge will typically say, 'Your favorite most muscular,' ... Competitors are allowed to choose how they strike this pose."
- WNBF hands on hips [S6]: "Hands are rotated downward and placed on the hips"; "a slight forward lean crunching the abs". Tip: "Rotate your elbows as far forward as possible".
- WNBF crab [S6]: "The entire upper body is fully flexed with biceps curled"; "A slight lean forward to highlight the traps and shoulders". Tip: "Don't lean over too far and cover the abdominal muscles."

| Quantity | Crab | Hands on hips | Hands in front | Basis |
|---|---|---|---|---|
| Facing | front | front | front | [S6][S17] |
| Stance width | one leg slightly forward; stance_ratio 0.80 [M n=1], band 0.40..1.20 | legs together or one forward; 0.25 [M n=1], band 0.10..0.80 | legs fairly close [S12]; band 0.10..0.80 [ESTIMATE] | [S17][S6][S13] |
| Knee bend | 7°, knees pointed out slightly | 11° | 5..15° [ESTIMATE] | "point your knees out slightly" [S17]; [M 6..9 crab, 7..15 hips] |
| Foot placement | toes out about 45° | same | same | [S12] |
| Trunk lean | forward; about 22..41° more than the other front poses [M n=1]; band 10..35° past calibration [ESTIMATE] | upright with a slight crunch; 0..15° [ESTIMATE] | upright; 0..10° [ESTIMATE] | [S6][S17]; [M crab 38.3°, other front poses -2.5..16.4°] |
| Abduction, each arm | 7°, band 0..30° | 41°, band 30..55° | 15°, band 0..35° [ESTIMATE] | [M 5..9 crab, 40..42 hips, n=1 each] |
| Elbow flexion, each arm | 90°, band 75..110° | 87°, band 75..100° | 20..70° [ESTIMATE] | [M 84..96 crab, 85..88 hips] |
| Forearm direction | across the body, 95° | down and in, 135° | down, ≥ 140° [ESTIMATE] | [M 91..101 crab, 131..139 hips] |
| Wrist height | -0.75 (in front of the lower abs), band -0.90..-0.60 | -0.75 (on the hips), band -0.85..-0.60 | -0.75, band -0.95..-0.60 [ESTIMATE] | [M -0.81..-0.69 crab, -0.76..-0.73 hips] |
| Hand position | fists with "a few inches between them"; wrist_gap ≤ 0.30 | hands "rotated downward" on the hips; wrist_gap 0.60..0.95 | wrist gripped, or fists or palms pressed together; wrist_gap ≤ 0.20 [ESTIMATE] | [S17][S6]; [M 0.16 crab, 0.76 hips] |
| Head direction | face the camera | face the camera | face the camera | [ESTIMATE] |
| Elbow span | 1.16 [M n=1], band ≤ 1.50 | 1.88 [M n=1], band ≥ 1.70 | ≤ 1.40 [ESTIMATE] | [M] |

The camera cannot measure:
- Full-body contraction: traps, delts, pecs, arms, abs, and legs [S17][S6].
- For the hands-in-front variant: "pull apart isometrically" with a wrist grip, or "push from each side" with fists or palms together [S17].
- Glutes do not need contracting, because the judges cannot see them [S14].

| Fault | Detectable signature | Spoken cue | Source |
|---|---|---|---|
| Crab leaning too far, abs hidden | lean > 35° past calibration [ESTIMATE] | "Lean less, show your abs." | [S6][S13] |
| Crab fists far apart | wrist_gap > 0.30 | "Bring your fists closer together." | [S17] |
| Hands-on-hips elbows back | elbow_span grows past 2.0 [ESTIMATE] | "Roll your elbows forward." | [S6] |
| Shoulders hiked up | shrug < 0.80 | "Keep your shoulders down." | [S12] |
| Dead legs | knee_flex 0° on both legs (partial sign only) | "Flex your legs, knees out." | [S17][S13] |
| Loose midsection | none | "Tighten your waist." | [S13] |
| Wrong variant for the build | none (a coaching choice) | "Try hands on hips instead." | Merritt: hands-on-hips suits lighter athletes, the crab needs "a lot of upper body mass" [S17] |

Build-up (crab):
1. Feet: Step one foot slightly forward with your toes out.
2. Legs: Point your knees out and flex your quads.
3. Hips: Keep your hips square to the camera.
4. Torso: Lean forward slightly from the waist.
5. Arms: Bring your arms in front of you with your elbows bent.
6. Hands: Make fists a few inches apart.
7. Head: Look at the camera.
8. Finish: Flex your traps, chest, and arms all together.

---

## Left-right variants and the side convention

Two poses have a mandatory left or right version. Several others have sided legs or grips.

| Pose | Sided part | Rule | Proposed engine ID |
|---|---|---|---|
| Relaxed side | whole pose | First quarter turn to the right shows the left side, the third shows the right side [S3][S6][S9]. | `relaxed_side_left`, `relaxed_side_right` |
| Side chest | whole pose | IFBB: "either side ... to display the 'better' arm" [S1]. OCB calls "Right Side Chest" and "Left Side Chest" [S9]. BarBend says athletes "first perform the pose on the right side" [S16]. | `side_chest_left`, `side_chest_right` |
| Side triceps | whole pose | IFBB: "either side ... to show the 'better' arm" [S1]. OCB calls both sides [S9]. | `side_triceps_left`, `side_triceps_right` |
| Front double biceps | legs | IFBB: "one leg 40-50 cm forward and to the side", either leg [S1]. WNBF allows symmetric legs [S6]. | `front_double_biceps` plus a `forward_leg` field |
| Back double biceps | legs | One foot back on its toes [S1][S6]. | `back_double_biceps` plus `back_leg` |
| Back lat spread | calf | Show "the opposite calf" to the back double biceps [S1]. | `back_lat_spread` plus `flexed_calf` |
| Abdominals and thighs | legs, arms | One leg forward [S1]. WNBF allows switching legs during the pose [S6]. WNBF Australia allows one hand on the hip [S8]. | `abdominals_and_thighs` plus `forward_leg` |
| Most muscular | grip, legs | Free choice of variant and grip hand [S17][S8]. | `most_muscular` plus `variant` |

Convention: name a side pose after the athlete's side that faces the camera, as IFBB does ("left or right side towards the judges" [S1]). In `side_chest_left`, the left arm is the bent front arm and the left heel is up. In `side_triceps_left`, the left arm is straight. If the app mirrors the camera preview, derive sides from the landmark labels and not from screen position. Default to the user's chosen "better" side, and let comparison practice call both sides as OCB does [S9].

Figure fact: `Pose` in `scripts/figure/skeleton.ts` is "defined for the LEFT side in world-rest axes. The right side is mirrored automatically." [CODE]. A mirrored pose can show only the relaxed front and back, the front lat spread, and symmetric-leg versions of the double biceps poses. Every sided row in the table above needs separate left and right bone rotations before the 3D model can show the target.

## Reference measurements

Method:
- Tool: MediaPipe Pose Landmarker, heavy model [S22], Python package `mediapipe` 1.1.0, IMAGE mode, in a one-off script that is not kept.
- Landmarks: every detection is kept in `src/pose/fixtures/refs-landmarks.json`, with the metrics measured from it.
- Photos: 26 reference images. Eight come from the IFBB 2019 men's bodybuilding rules: Figures 1..7 and the Appendix 3 "Front Position" [S2]. Nine come from the IFBB 2019 Men's Classic Physique rules: the front position, three quarter turns, and five poses [S3]. Nine come from the WNBF pose infographics [S7]. The IFBB sets show one athlete each. In the WNBF set, the side chest and rear double biceps athletes are women.
- Why the 2019 IFBB pictures: the 2026 PDF lists "Appendix 2: Pictures of the Seven Mandatory Poses", but `pdfimages` finds only one image in it, the logo on page 1 [S1]. The 2019 pose text matches the 2026 text word for word apart from one heading word [S1][S2].
- Results: all 26 images produced a pose. The overlays were checked by eye.
- Limits: n is 1..3 per pose. Angles are 2D, so depth (elbows forward, a forward foot, lean) is weak. The athletes are trained professionals photographed in a studio, not beginners on a webcam. Pass bands built from these ranges are [ESTIMATE].

| Pose | n | abduction | elbow_flex | elbow_height | wrist_height | stance_ratio, or stagger for side poses | hip_width | elbow_span | knee_flex (lower / higher leg) | hidden wrists |
|---|---|---|---|---|---|---|---|---|---|---|
| Relaxed front | 2 | 41..59 | 37..43 | -0.35..-0.23 | -0.74..-0.50 | 0.34..0.55 | 0.36..0.40 | 1.85..1.95 | 3..8 / 5..10 | none |
| Relaxed side (near arm) | 2 | 23..32 | 20..30 | -0.52..-0.49 | -1.03..-1.03 | stagger 0.00 | 0.12..0.25 | 1.69..1.94 | 3.5..4.1 | none |
| Relaxed back | 1 | 33..37 | 44..51 | -0.43..-0.39 | -0.82..-0.79 | 0.40 | 0.39 | 1.74 | 1.5..1.6 | none |
| Front double biceps | 3 | 88..102 | 107..121 | -0.01..+0.10 | +0.33..+0.43 | 0.85..1.05 | 0.33..0.35 | 2.28..2.46 | 1..11 / 14..21 | none |
| Front lat spread | 2 | 49..53 | 99..106 | -0.31..-0.29 | -0.60..-0.54 | 0.49..0.75 | 0.37..0.39 | 1.94..2.07 | 4..9 / 8..11 | none |
| Side chest (near arm) | 3 | 3..8 | 73..111 | -0.55..-0.51 | -0.70..-0.57 | stagger 0.02..0.08 | 0.13..0.17 | 1.46..1.91 | far 15..35 / near 60..67 | none |
| Back double biceps | 3 | 95..100 | 94..122 | +0.03..+0.10 | +0.39..+0.48 | 1.04..1.15 | 0.32..0.39 | 2.23..2.46 | 7..18 / 13..33 | none |
| Back lat spread | 2 | 38..44 | 89..103 | -0.35..-0.33 | (hidden) | 0.69..1.42 | 0.38..0.41 | 1.74..1.80 | 7..24 / 12..25 | both, 0.09..0.26 |
| Side triceps (near arm) | 3 | 6..12 | 9..13 | -0.60..-0.55 | -1.06..-1.02 | stagger 0.06..0.50 | 0.12..0.26 | 0.88..0.95 | near 30..61 / far 43..57 | far, 0.01..0.03 |
| Abdominals and thighs | 3 | 139..171 | 108..128 | +0.29..+0.38 | (hidden) | 0.28..1.07 | 0.33..0.34 | 1.33..1.84 | 2..4 / 13..22 | both, 0.00..0.02 |
| Most muscular, crab | 1 | 5..9 | 84..96 | -0.70..-0.68 | -0.81..-0.69 | 0.80 | 0.51 | 1.16 | 6..9 | none |
| Most muscular, hands on hips | 1 | 40..42 | 85..88 | -0.42..-0.37 | -0.76..-0.73 | 0.25 | 0.40 | 1.88 | 7..15 | none |

## Sources

All URLs were fetched on 2026-10-10.

| # | Title | Author or org | Year | URL | Type |
|---|---|---|---|---|---|
| S1 | IFBB Rules Section 2: Men's Bodybuilding (2026 edition; Appendix 1 pose descriptions) | International Fitness and Bodybuilding Federation (IFBB) | 2026 (PDF created 2026-03-20) | https://ifbb.com/wp-content/uploads/2025/07/Mens-Bodybuilding-Rules-2026-1.pdf | rulebook |
| S2 | IFBB Rules Section 2: Men's Bodybuilding (2019; Appendix 2 pose pictures, Appendix 3 front position) | IFBB | 2019 | https://ifbb.com/wp-content/uploads/RULES/Mens-Bodybuilding-Rules-2019.pdf | rulebook |
| S3 | IFBB Rules Section 16: Men's Classic Physique (2019; Appendix 2 quarter turns, Appendix 3 pictures) | IFBB | 2019 | https://ifbb.com/wp-content/uploads/RULES/Mens-Classic-Physique-2019.pdf | rulebook |
| S4 | Pro Competition Rules, Men's Open Bodybuilding tab | IFBB Professional League | 2026 (modified 2026-09-30) | https://www.ifbbpro.com/rules/ | rulebook |
| S5 | Official Bodybuilding Rules (text read through https://npcnewsonline.com/wp-json/wp/v2/pages?slug=official-bodybuilding-rules) | National Physique Committee (NPC), NPC News Online | 2026 (modified 2026-02-15) | https://npcnewsonline.com/official-bodybuilding-rules/ | rulebook |
| S6 | 2026 World Natural Bodybuilding Federation Judging Criteria and Rules (read as plain-text export) | World Natural Bodybuilding Federation (WNBF) | 2026 | https://docs.google.com/document/d/151BXb00D9LTF9d7QIIKYlPcln3-Hexq5YDTrp6Vb7E4/edit?usp=sharing | rulebook |
| S7 | WNBF Bodybuilding (category page with nine pose infographics) | WNBF | 2026 (modified 2026-05-08) | https://worldnaturalbb.com/competition-category/bodybuilding/ | federation guide |
| S8 | Bodybuilding Poses | WNBF Australia | n.d. | https://www.wnbfaustralia.com/poses/bodybuilding | federation guide |
| S9 | Men's Bodybuilding Guidelines | Organization of Competitive Bodybuilders (OCB) | 2026 (modified 2026-09-24) | https://ocbonline.com/mens-bodybuilding/ | rulebook |
| S10 | How To Do The Front Double Biceps Pose | John Romano, Muscle & Fitness | 2023 | https://www.muscleandfitness.com/flexonline/training/how-to-do-the-front-double-biceps-pose/ | coach, publication |
| S11 | How To Do The Rear Double Biceps Pose | John Romano, Muscle & Fitness | 2023 | https://www.muscleandfitness.com/flexonline/training/how-to-do-the-rear-double-biceps-pose/ | coach, publication |
| S12 | 8 Bodybuilding Poses Explained by a Natural Pro Bodybuilder | Bradley Grunner, MS, RD (ANBF pro), Breaking Muscle | 2023 | https://breakingmuscle.com/bodybuilding-poses/ | pro, publication |
| S13 | The 8 Mandatory Bodybuilding Poses: A Complete Guide | Andreas Abelsson, StrengthLog | 2025 | https://www.strengthlog.com/bodybuilding-poses/ | publication |
| S14 | Bodybuilding Posing Tips (excerpt from the book Bodybuilding Anatomy) | Michael Israetel, Jared Feather, Christle Guevarra, Human Kinetics | n.d. | https://us.humankinetics.com/blogs/excerpt/bodybuilding-posing-tips | book excerpt |
| S15 | Bodybuilding Posing Tips | ExRx.net | n.d. | https://exrx.net/Bodybuilding/Posing | publication |
| S16 | 10 Bodybuilding Poses: What They Are and How to Do Them | Peter Marino, updated by Jake Dickson, BarBend | 2023 (updated 2024) | https://barbend.com/news/bodybuilding-poses/ | publication |
| S17 | The Most Muscular Pose: Everything You Need to Know | Greg Merritt, The Barbell | 2026 | https://thebarbell.com/most-muscular-pose/ | publication |
| S18 | Mike Mentzer's Art of Posing: How to Present a Championship Physique | John Little, mikementzer.org | 2026 | https://mikementzer.org/mike-mentzer-art-of-posing/ | coach (Mentzer method) |
| S19 | Learn Bodybuilding Posing Transitions and Footwork From Terrence Ruffin | Terry Ramos, BarBend | 2024 | https://barbend.com/news/learn-bodybuilding-posing-transitions-and-footwork-from-terrence-ruffin/ | pro, publication |
| S20 | Learn To Lat Spread From 7X Mr. Olympia Phil Heath | Terry Ramos, BarBend | 2024 | https://barbend.com/news/learn-to-lat-spread-phil-heath/ | pro, publication |
| S21 | Dorian Yates Explains His Rear Double Biceps Pose | Scott Felstead, Muscle & Fitness | 2024 | https://www.muscleandfitness.com/flexonline/training/dorian-yates-explains-his-rear-double-biceps-pose/ | pro, publication |
| S22 | MediaPipe Pose Landmarker model, heavy, float16 | Google | n.d. ("latest" file) | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task | tool |

## Open questions

- Which federation is the default? IFBB 2026 men's bodybuilding has 7 poses, no most muscular, and no quarter turns [S1]. NPC, IFBB Pro, WNBF, and OCB all use quarter turns and a most muscular [S4][S5][S6][S9]. The app needs a federation setting at least for the side triceps feet, the front double biceps stance, the relaxed foot angle, and the pose list.
- No rulebook gives an arm angle. Every arm number in this file comes from 26 photos, with 1..3 photos per pose [M]. A larger set of 20 or more photos per pose [ESTIMATE], with several athletes and both sides, would firm up the bands.
- Depth-only targets cannot be checked with one 2D camera: elbows forward in the lat spreads and the double biceps [S6][S12][S15], the forward leg [S1], and the abdominal crunch [S1]. Single-image 3D lean read -2.5..16.4° across the front poses other than the crab [M]. This needs a test on real webcam video.
- Hidden wrists: both wrists in abdominals and thighs and the back lat spread, and the rear wrist in side triceps, read visibility 0.00..0.26 [M]. These poses must be scored from shoulders and elbows.
- Head direction (turn the head in the back double biceps, face the camera in the side poses, look along the body in the relaxed side) needs face landmarks. I did not measure it.
- Fists versus open hands needs a hand landmarker. I did not test one.
- Coaches disagree in four places: elbows back in the back double biceps [S11] versus [S12][S16]; leaning back in the front lat spread [S16] versus [S6]; breathing in side triceps [S6] versus [S8]; and flexed arms in abdominals and thighs [S6] versus [S12]. I followed the federation text each time.
- Webcam height and distance: Mentzer records from judge eye level [S18]. A laptop camera at desk height looks up at the athlete and will shift heights and lean. The app should guide the camera setup.
- Two WNBF references are women. Female arm angles may differ from male ones in the side chest and rear double biceps.
- The mirrored `Pose` type [CODE] cannot show the sided poses. Decide whether the viewer gets per-side bone data or a mirror flag per pose.
- The voice cues are my wording. Test them with beginners for clarity and timing.

## Practice formats coaches recommend

These become the practice modes.

- Holding drills. Human Kinetics recommends long sessions that run through all the poses several times, "holding each pose a few seconds longer (about five to 10 seconds total) than will usually be asked of you in competition" [S14]. Mentzer's progression starts with "short holds and ample rest", then "Gradually extend the holds" while breathing under tension [S18]. WNBF calls posing stamina "critical" [S6].
- Build-up order. Learn each pose from the ground up: feet, legs, pelvis and waist, rib cage and lats, arms and hands, then head and expression. "Only after these pieces can be reproduced should the hold be lengthened" [S18][S14].
- Quarter turns. Use the head-judge sequence: front, quarter turn right (left side), back, right side, front [S3][S6][S9]. Between mandatory poses, OCB judges may tell athletes to "relax" and take "the appropriate symmetry pose" [S9].
- Callouts and speed. OCB urges athletes "to get into their poses as quickly as possible", because slow wind-ups risk "having the next pose called" first [S9]. OCB also calls poses "not necessarily in this order" [S9].
- Transitions. Mentzer splits each transition into four parts: release, first step or pivot, arm and torso travel, and arrival of tension. He films them in slow motion and says "If a transition cannot be performed reliably when tired, simplify it" [S18]. ExRx moves the arms "in a circular path", keeps the hands open during a transition and clenched in the pose, and uses quarter, half, and three-quarter turns [S15]. Terrence Ruffin uses a "military-style" approach with pivots and side turns, for example from a front double biceps into a side chest. He also steps through a back lat spread into a side triceps [S19].
- Routines and posedowns. NPC routine: 60 seconds maximum [S5]. IFBB Pro routine: three minutes maximum [S4]. WNBF routine: 60 seconds [S6]. WNBF Australia routine: 45 seconds or less [S8]. IFBB posedown: 30 to 60 seconds [S1]. NPC and IFBB Pro posedown: 60 seconds [S4][S5].
- Timing. NPC and IFBB Pro give each athlete 60 seconds for the 8 mandatory poses [S4][S5], which averages 7.5 seconds per pose including transitions [S4][S5, computed]. IFBB finals run the 7 poses twice, with the line-up order reversed for the second run [S1].
- Feedback. Record from judge eye level, change "one variable at a time", review still frames and unfamiliar angles, and rehearse without a mirror before the show [S18]. Dorian Yates noted "you can't really see your back when posing even with two mirrors" [S21].
- Frequency. Mentzer recommended "at least three half-hour posing sessions each week", more often as the contest nears, without draining sessions in the final days [S18]. Breaking Muscle says to practice right after workouts or when fresh, more often as the show approaches [S12].

| Practice mode | What the app does | Basis |
|---|---|---|
| Learn | Walks one pose through the 8 build-up steps with short holds of 3..5 s [ESTIMATE] | [S14][S18] |
| Hold | Holds one pose for 10..15 s [ESTIMATE] and scores stability; extends the hold over sessions | [S14][S18] |
| Callout | Calls random poses and scores time-to-pose, with a target under 3 s [ESTIMATE] | [S9] |
| Quarter turns | Runs front, left side, back, right side, front, and scores each relaxed pose | [S3][S6][S9] |
| Mandatory run | Runs the federation pose list: IFBB 4-pose elimination, IFBB 7, or NPC and IFBB Pro 8 within 60 s | [S1][S4][S5] |
| Comparison round | Head-judge voice calls poses in random order with "relax" between, then runs the set a second time | [S1][S9] |
| Transitions | Drills pose pairs, for example front double biceps to side chest, back lat spread to side triceps, and a side-to-side turn | [S15][S18][S19] |
| Routine and posedown | Timers of 45 s, 60 s, or 3 min with music, plus a 30..60 s posedown | [S1][S4][S5][S6][S8] |
| Video review | Records from judge eye level, then shows still frames per pose without a live mirror | [S18][S21] |
