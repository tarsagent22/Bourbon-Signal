# Live bottle recognition — October 17, 2026

This replaces the still-photo scanner described in
`bottle-label-recognition-20261017.md`. It retains that matching/catalog work.

## Native capture

- iOS: a local Expo view owns an AVFoundation preview and video-data output.
  Upright 1080p pixel buffers go directly to a reused Apple Vision text request
  on a serial worker queue. Late frames are discarded. Analysis starts at most
  four times per second; preview rendering remains independent.
- Android: a local Expo view owns a CameraX preview and image analyzer, using
  `STRATEGY_KEEP_ONLY_LATEST`, a single worker, and a reused bundled ML Kit Latin
  recognizer. Input comes directly from `media.Image`, with rotation retained.
  Every image proxy closes on success, failure, pause, or detach.
- Both implementations emit bounded text blocks, confidence, normalized upright
  coordinates, analysis duration, sequence, a scan token and a 36-value central
  luminance signature. No camera images are saved or uploaded. The signature
  stays in transient session memory and is used only to invalidate old evidence.
- Camera permission remains requested at the scanner. Background/blur stops the
  camera. Confirming results pauses analysis while retaining the live preview.
  Rescan reuses the camera and recognizer instead of remounting them. Native and
  JS checks reject old scan tokens and results from paused or detached sessions.
- The URI/file OCR entry point and the JavaScript photo/crop/delete/timer loop
  have been removed. Older binaries show the existing search fallback.

## Evidence and suggestions

Only text visible in the cover-filled preview and meeting the minimum OCR
confidence contributes. Four recent observations may be retained for at most
1.25 seconds. Current-frame specific expressions take precedence. A recognized
brand may complete a subsequent expression-only fragment (Penelope → Riviera).
New current expression text replaces a prior expression (Riviera → Rio).

Evidence clears on scene-signature change, family change, expiration, blank gaps,
blur, rescan or explicit reset. Multiple recognized brands cannot confirm a
match. The luminance signature is a conservative motion heuristic, not a claim
of perfect object tracking. Moving between very similar bottles still requires
physical-device testing and user confirmation.

Candidates appear after the first useful event. Weak reads preserve the current
card order when those candidates remain eligible. A newly read expression can
lead immediately. Confirmation requires two fresh agreeing expression reads;
reusing old expression text with a brand-only or blank frame cannot confirm it.
All family expressions remain accessible for manual selection.

Transient timing metrics record first frame, first suggestion, confirmation,
frame count, mean analysis time and reset count. The optional `onMetrics` callback
and development console contain only timing/count information, never label text
or camera images. These metrics make phone latency measurable without claiming
desktop test timings represent real-camera performance.

## Build and verification

Native runtimes are isolated as `1.1.0-ios-live-labels-1` and
`1.1.0-android-live-labels-1`. This needs a new binary; an OTA to an existing
scanner binary cannot add the native view.

Automated temporal regressions cover partial reads, conflicting expressions,
scene/brand changes, low-confidence/off-screen text, blank gaps, expiration,
out-of-order events, rescan and held results. Responsive scanner-source journeys
exercise the actual matching and session code with simulated native frame events
at 320px and 393px, including warm rescan. Kotlin compilation is checked against
the real generated Android app and SDK. iOS compilation is checked separately
through EAS; JavaScript exports alone are not native compilation evidence.

Physical acceptance remains required: measure first suggestion and exact
expression confirmation on supported phones; test the three owner bottles,
curved/glossy labels, hand movement, bottle switches, background/resume, denied
permission, torch, and repeated scans. A sub-second first suggestion is a target,
not a measured result or guarantee.

Build uploads preserve the existing signing/environment exclusions and omit web
images, engine exports and local module build products, which are not inputs to
the native app.
