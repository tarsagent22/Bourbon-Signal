# Radar layout and push recovery

The owner requested a plain login link, no motion field on Radar or Account, a compact saved-area display, Push Notifications terminology, and the Community sightings description “Alerts when other members post in your area”.

Radar now shows a compact saved-area count on Alerts and retains the editable Locations row in preferences. It no longer repeats every selected area beneath either page. All saved scopes remain intact. Welcome keeps its travelling-wave background and an underlined login link without an outline. Membership and Rewards retain their existing motion fields.

The push investigation found that logout both wrote the account's opt-in to Off and left a module-wide logout latch blocking automatic recovery. Logout now disconnects the device while retaining account-scoped choice; authenticated maintenance starts a new session before recovery. A different account cannot inherit consent, the old session cannot restart delivery, and a manual Off remains Off. Module reload recovery reads retained secure storage without requesting OS permission.

Session-specific operation keys and stale-response checks keep old registration results away from the active account. Binding-specific revocations are retained independently, including two outstanding sessions, and an old revocation cannot erase a newer capability. When a binding-specific logout revoke is pending, broad device disable is not used because a delayed request could disconnect a newer login.

Previously stored Off values are intentionally not guessed or migrated to On: an affected member may need to enable Push Notifications once after updating. Future same-account logins restore that saved choice when permission, membership, connectivity, and provider registration allow it.

Validation: full mobile verification with production Android/iOS exports; root TypeScript and Astra suites; focused push/logout tests including mounted authenticated maintenance, foreground recovery, same-account login, another account, manual Off, reload, offline revocation, delayed registration, and two pending revocations; 31 responsive browser journeys at 320px/390px including a 40-area selection, both Radar tabs, no Radar/Account dots, exact notification copy, and the unboxed login link.

Browser/API/provider boundaries are simulated. The local tests establish the recovery behavior, not the exact cause on the owner's phone or physical push receipt. OTA identity and served assets are verified separately; physical iPhone delivery and acceptance remain pending.
