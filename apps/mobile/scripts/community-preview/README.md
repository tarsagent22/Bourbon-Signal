# Community card preview

This fixture renders the actual `SignalCard`, `CommunityPostCard` and `BadgeCollection` through React Native Web with synthetic members, posts and dated awards. The icon adapter uses the installed Material Community Icons font. Only approved-shaped synthetic image URLs are mapped to a local original bottle illustration by the preview bundler. No live data, credentials or API writes are used. The mapping never enters production source or OTA exports.

Run `node scripts/community-preview/build.mjs` from `apps/mobile`, then serve `dist/community-preview`. Inspect 390×844 and 320×568 views, full-photo and badge dialogs, long names, captions and cards without images. Browser rendering does not prove native-device interaction or OTA installation.
