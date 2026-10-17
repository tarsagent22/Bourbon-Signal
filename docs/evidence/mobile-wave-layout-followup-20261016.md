# Welcome and full-page wave follow-up

The owner requested these changes after reviewing physical iPhone screenshots of PR #767:

- Remove the Saved & suggested section from Home. Keep existing personal ratings and relevant unfinished-alert setup prompts. Home no longer fetches onboarding picks for that section, and onboarding no longer promises to display saved picks on Home.
- Give the welcome screen a larger Bourbon Signal. wordmark, the headline Never miss a drop., and account actions immediately beneath the headline. Remove both marketing subtext lines and give Log in a full-width outlined target with an underlined label.
- Let the travelling-wave field fill the welcome background behind transparent header and footer areas. Move the existing Radar, Account, Membership, and Rewards fields behind the full screen instead of compressing them into headings.
- Retain the selected 1.2x speed and 130% visibility, a static Reduce Motion field, and focus/app-state animation pausing.

Validation passed: full mobile verification with production Android and iOS exports; root TypeScript and Astra suites; 31 browser journey checks at 320px and 390px, including 568px short-screen account actions, full-field bounds, both authentication links, Home without suggestions, preserved personal ratings and handoffs, and Reduce Motion. The actual screen source is rendered in the preview; camera, purchases, API data, and push boundaries are simulated.

Physical iPhone acceptance of this follow-up remains pending. Production delivery is verified separately using the merged commit and the served Expo manifest and asset hashes.
