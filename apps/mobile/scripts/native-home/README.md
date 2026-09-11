# Native Home diagnostic fixture

This is a test-only entry, **not** the application's entry and never an OTA release payload.

It imports the actual Home screen and tab-header layout. React Native rendering,
Expo Router, native headers, SecureStore, accessibility APIs, images, and animation
remain real. Only the signed-in identity and API are replaced with clearly labeled
synthetic data; no live customer credentials or live API writes are used. Other
tabs are explicit placeholders, not tested implementations.

The optional Metro configuration must be temporarily loaded as the mobile
project's `metro.config.js`; this installed Expo export:embed implementation
accepts `--config` but does not forward it into loadMetroConfigAsync. Remove the
temporary config after export. Inspect the resulting source map: it must include
`fixture.ts`, actual Home/layout, native SecureStore and navigation, and must not
include the real `src/hooks/useMobileApi.ts` implementation.

A successful export is not native verification. Run the generated bundle inside
the matched compiled iOS simulator shell and inspect native logs and screenshots.
This fixture does not prove real sign-in, real backend behavior, OTA transport, or
physical-device startup. Keep those evidence boundaries explicit.
