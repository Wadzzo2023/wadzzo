# App Store Connect submission pack: Wadzzo (iOS)

Everything to paste into App Store Connect for this release, plus what to check first. Fields are limited by Apple, so each shows its length.

> **This is an update to the existing listing**, not a new app: bundle ID `com.thebillboardapp.wadzzo`, App Store Connect app `1639649037`, Apple team `L5747V2LKA` (from `eas.json`). The previous version on the store is **4.8.2**.

## 0. Fix these before you submit

| # | Issue | Why it matters | What to do |
| - | ----- | -------------- | ---------- |
| 1 | **No way to report content or block users** in the app, but users post comments, bounty entries and chat messages that other people see | App Review Guideline 1.2 (user-generated content) is a common rejection: it needs content reporting, blocking abusive users, a filter or moderation process, and published contact details | Add "Report" and "Block" to comments, entries and chat, and a moderation path you can describe in the review notes (section 7, item 8). Do not describe moderation that is not in the build. |
| 2 | **No Terms of Use / EULA** page exists (only Privacy, FAQ, About, Support on app.wadzzo.com) | UGC apps are expected to have terms that forbid objectionable content | Publish `/terms`, or rely on Apple's standard EULA and say so in the description. |
| 3 | **The privacy policy does not mention** camera, photos, user content (comments, entries, chat), sign-in providers (Google, Apple, Firebase), wallet creation, retention or how to delete the account | Apple compares the policy with your privacy answers (section 5) | Update `apps/market/src/app/(site)/privacy/page.tsx` to match section 5 before submitting. |
| 4 | **Icon has an alpha channel** (`assets/icon.png` is 1024x1024 with alpha) | App Store Connect rejects a marketing icon with transparency (ITMS-90717). Expo normally flattens it for iOS, but check | Inspect the icon in the built archive, or export the PNG without alpha and rebuild. |
| 5 | **Version number** | The app config says `6.0.1`. It must be higher than the version now live in App Store Connect | Check App Store Connect > App Store > the live version, and raise `version` in `app.config.ts` if needed. Build numbers are automatic (EAS). |
| 6 | **A reviewer cannot be near a drop** | They would see an empty AR view and may reject for "cannot test" | Create a review drop that can be collected by QR from anywhere, attach its QR image in App Review, and fill the `[FILL]` lines in section 7. |
| 7 | **The review account must work** | Email sign-in needs a **verified** email; Apple will not use Google or Apple sign-in with your accounts | Create and verify the demo account, put it in section 7 and test it on a clean install. |

Also worth a look: if the built `Info.plist` lists `arkit` under `UIRequiredDeviceCapabilities` (ViroReact can add it), devices without ARKit stop being offered the update. That is allowed, but make it a decision.

## 1. App information (the listing)

| Field | Value | Length |
| ----- | ----- | ------ |
| **Name** | `Wadzzo` | 6/30 |
| Name alternatives | `Wadzzo AR` (9), `Wadzzo: AR Drops & Bounties` (27) | |
| **Subtitle** | `Collect brand drops in AR` | 25/30 |
| Subtitle alternatives | `Scan and collect real drops` (27), `Treasure hunt with brands` (25) | |
| **Primary category** | Keep what the live listing has. If you are free to choose: **Lifestyle** | |
| Secondary category | Entertainment | |
| **Support URL** | https://app.wadzzo.com/support | |
| **Marketing URL** | https://app.wadzzo.com | |
| **Privacy Policy URL** | https://app.wadzzo.com/privacy | |
| **Copyright** | `2026 [FILL: legal entity that owns the app]` | |
| Version | `6.0.1` (see item 5 above) | |
| Bundle ID | `com.thebillboardapp.wadzzo` | |
| Platforms | iPhone and iPad (the app config keeps iPad support; an update may not drop a device family) | |
| Price | Free, no in-app purchases | |

Keep the **name** as `Wadzzo` unless you want to rename the existing listing; put the descriptive words in the subtitle.

## 2. Promotional text (139/170)

Can be changed any time without a new review.

```
Walk up to real places, spot floating coins in AR and collect cards from brands you love. Join bounties, scan murals and earn Wadzzo Coins.
```

## 3. Description (1795/4000)

```
Wadzzo turns the real world into a collectible game.

Brands drop digital collectibles at real places: shops, parks, murals, events. Open the map, walk up to a drop and capture it as a floating coin in augmented reality, or scan a Wadzzo QR code. Every capture becomes a card in your collection.

WHAT YOU CAN DO

• Explore the map. See drops, events and murals around you, with directions to get there.
• Capture in AR. Coins hover in the real world, right where the drop was placed.
• Scan QR codes. Grab a drop from a printed code, with a torch for dark places.
• Build your collection. Cards come in rarity levels, with a holographic foil that shimmers as you tilt your phone.
• Join bounties. Brands post tasks with rewards: send photos and notes, follow your entry's status and chat with the brand.
• Scan murals. Point your camera at street art, sweep left and right, and earn Wadzzo Coins.
• Follow your favourite brands, RSVP to their events and read their announcements.

BROWSE FIRST, SIGN IN WHEN YOU'RE READY

You can look around without an account. Sign in only when you want to collect, follow, comment or join a bounty, with email, Google, Sign in with Apple or the Albedo wallet. We set up a wallet for you automatically.

YOUR PRIVACY, YOUR CONTROL

Wadzzo uses your location only while the app is open, to show drops near you and to check you are close enough to collect one. The camera is used for AR, QR scanning and mural scanning, and you choose which photos to attach to a bounty entry. You can delete your account at any time from your profile.

Wadzzo is free to use. Drops, events and bounty rewards are provided by participating brands, and what you see depends on where you are.

Privacy Policy: https://app.wadzzo.com/privacy
Support: https://app.wadzzo.com/support
```

## 4. Keywords (97/100) and What's New

Keywords (comma separated, no spaces after commas, none repeating the name or subtitle):

```
collectibles,rewards,bounties,qr,scanner,coins,cards,murals,street art,augmented reality,treasure
```

What's New in this version (616/4000):

```
A brand-new Wadzzo, rebuilt as a native app.

• Native augmented reality: capture spinning coins placed in the real world
• A new map with nearby drops, events and murals, plus in-app directions
• Your collection as cards with rarity and a holographic foil that follows your tilt
• Bounties: join, send photos and notes, and chat with the brand
• Murals: scan street art with your camera and earn Wadzzo Coins
• Events and announcements from the brands you follow
• Sign in with email, Google, Sign in with Apple or Albedo, and delete your account from your profile

You will be asked to sign in once after updating.
```

## 5. App Privacy (the "nutrition label")

Wadzzo has **no analytics, advertising or tracking SDKs** (the only third-party client libraries are for sign-in, maps and AR). Answer **"No, we do not use data to track you"**, so no App Tracking Transparency prompt is needed and `NSUserTrackingUsageDescription` is not in the app.

| Data type (Apple's name) | Collected? | Linked to the user | Used for | Where it comes from |
| ------------------------ | ---------- | ------------------ | -------- | ------------------- |
| Contact Info > **Email Address** | Yes | Yes | App Functionality (account, sign-in) | email sign-up, Google, Apple |
| Contact Info > **Name** | Yes | Yes | App Functionality (display name) | profile, Google, Apple |
| Identifiers > **User ID** | Yes | Yes | App Functionality (account, wallet address) | account creation |
| Location > **Precise Location** | Yes | Yes | App Functionality (nearby drops, collect, mural scans) | while the app is in use |
| User Content > **Photos or Videos** | Yes | Yes | App Functionality (profile picture, bounty attachments, mural scan frames) | photo library, camera |
| User Content > **Other User Content** | Yes | Yes | App Functionality (comments, bounty entries, chat) | typed by the user |
| Usage Data, Diagnostics, Financial Info, Purchases, Contacts, Health, Sensitive Info, Browsing or Search History | **No** | | | |

Check these against what you actually keep: if mural scan frames are stored (not just checked), keep Photos or Videos as above. If you add analytics or crash reporting later, this table and the policy must be updated first.

## 6. Age rating and App Review questions

Answer the questionnaire honestly; Apple calculates the rating. Expected answers:

| Question | Answer |
| -------- | ------ |
| Violence, sexual content, nudity, profanity, horror, medical, alcohol/tobacco/drugs, gambling, loot boxes | None |
| **User-generated content** | **Yes** (comments, bounty entries) |
| **Messaging and chat** | **Yes** (chat with the brand on a bounty) |
| Unrestricted web access | No (links open in the system browser view; Albedo sign-in uses a browser round trip) |
| Contests | Bounties are brand tasks with rewards: answer as the form defines "contest" and be consistent with the review notes |

The user-generated content and chat answers will raise the rating above 4+ (expect 13+, trust the form). That is a good reason to have the report and block features in place (item 1).

| App Store Connect item | Answer |
| ---------------------- | ------ |
| Export compliance | Already declared in the build (`ITSAppUsesNonExemptEncryption = false`): only standard HTTPS and system crypto |
| Advertising Identifier (IDFA) | Not used |
| Content rights | Brands supply their own drop images and text; confirm you have the rights to show them |
| Sign-in required | Check it and give the demo account (browsing works signed out, but collecting needs an account) |
| EU Digital Services Act trader status | Declare as a **trader** with your business address, phone and email if the app is distributed in the EU |
| Crypto / wallets (Guideline 3.1.5) | The developer account must be an **organization** (confirm team `L5747V2LKA` is one). The app has no exchange, trading, token sales or in-app purchases |
| Sign in with Apple (4.8) | Provided |
| Account deletion (5.1.1(v)) | Provided: Profile > Delete account |
| Location, camera, photos, motion purpose strings | Set in `app.config.ts`, specific and accurate |

## 7. App Review notes (paste into "Notes" and fill the `[FILL]` lines) (2486/4000)

```
HOW TO TEST WADZZO

Wadzzo is a location-based collectibles app. Brands place "drops" at real places; users find them on a map and capture them in AR or by scanning a QR code. No purchases, subscriptions or in-app payments exist in this app.

1) SIGN-IN (optional for browsing)
Browsing the map, brands, events and bounties works without an account. Signing in is requested only when collecting, following, commenting or joining a bounty.
Demo account (email + password, already verified):
  Email:    [FILL: review account email]
  Password: [FILL: review account password]
Sign in with Apple and Google are also available (Sign-in screen).

2) CAPTURING A DROP
Drops can only be captured near their real-world location, which a reviewer will not be near. To test capturing without travelling, use the attached QR code(s): open the AR tab, switch the pill at the top from "AR" to "QR", and scan the attached image. The drop is added to Collection. [FILL: attach a QR image for a review drop that is collectible from anywhere, and say which one.]
To see AR itself: open the AR tab and allow Camera and Location (a physical device with ARKit is needed; AR cannot run in the iOS Simulator).

3) BOUNTIES
Bounties tab -> open the bounty "[FILL: review bounty name]" -> Join -> Send an entry. Rewards are provided by the brand that posts the bounty; the app does not sell or trade tokens.

4) MURALS
Murals camera (Murals screen): point at a mural, sweep left then right. Detection runs on the device; frames are sent to our server only to verify a scan.

5) PERMISSIONS (all while the app is in use, none in the background)
Camera: AR, QR and mural scanning. Location: nearby drops and proximity check. Photos: attach images to bounty entries and set a profile picture. Motion: holographic card tilt and AR heading.

6) ACCOUNT DELETION
Profile -> Delete account. [Accounts that run a brand page are asked to delete it from the web instead.]

7) WALLET / COINS
"Wadzzo Coins" are in-app points earned by scanning murals; they cannot be bought, sold or transferred. Wadzzo creates a wallet for each account automatically; the Albedo option is an alternative sign-in only. The app has no exchange, trading or payment features.

8) USER-GENERATED CONTENT
[FILL: describe how users can report content and block users, and how reports are handled and how fast. This must be true of the build you submit.]

Contact: [FILL: name], [FILL: phone], support@wadzzo.com
```

## 8. Screenshots

AR needs a **physical iPhone** (the simulator has no ARKit), so take them on a device and keep the real UI (no marketing frames that hide it).

| Display | Pixels (portrait) | Needed |
| ------- | ----------------- | ------ |
| iPhone 6.9" | 1320 x 2868 (or 1290 x 2796) | yes, 3 to 10 |
| iPad 13" | 2064 x 2752 | yes, because the app supports iPad |

Suggested order and captions (the first three decide most installs):

| # | Screen | Caption |
| - | ------ | ------- |
| 1 | Map with drops and the nearby rail | Find drops around you |
| 2 | AR with a coin and its card | Capture coins in AR |
| 3 | Collection grid with holo cards | Collect cards that shimmer |
| 4 | A bounty with the entry sheet | Join bounties from brands |
| 5 | Murals camera mid-sweep | Scan murals, earn coins |
| 6 | Events or an announcement | Never miss a brand event |
| 7 | QR scanner | Scan a code to collect |
| 8 | Profile with Wadzzo Coins | Your coins, your profile |

An app preview video (15 to 30 s of 1 and 2) is optional.

## 9. Build and submit

```bash
cd apps/mobile
npm install
npx eas-cli@latest build --platform ios --profile production      # build number auto-increments
npx eas-cli@latest submit --platform ios --profile production --latest   # uses the ids in eas.json
```

Then in App Store Connect: select the build on the version page, fill sections 1 to 7, publish the privacy answers, add screenshots, choose **Manually release this version** (so you decide when it goes live) and enable **Phased release for automatic updates** (recommended for a rewrite replacing a v4 app), then **Submit for Review**.

TestFlight first: install the build on a real device, sign in with the demo account on a clean install, run the capture-by-QR path from section 7 and the account deletion path.
