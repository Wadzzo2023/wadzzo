# 03 · Auth

Browsing never needs an account. Auth appears only through the **AuthGate**
sheet, at the moment of an action — the same component and copy as the web
(`GATE_COPY`: collect, follow, profile, settings, redeem, ar, bounty). The
gate's "Continue" opens the sign-in screen, and after success the user lands
back where they were, with the action they tried **resumed** (e.g. the
capture goes through) rather than making them tap again.

## Flows

All four end the same way: get a credential → `POST /api/mobile/v1/auth/session`
→ store `token` in SecureStore → put `user` in the session store.

### Email + password — sign in
1. Form: email, password (show/hide). Validate with Zod on blur.
2. `POST /auth/session { walletType: "emailPass", email: lower(email), password }`.
3. Server does `signInWithEmailAndPassword` → if unverified, it re-sends the
   verification email and fails with `auth/unverified-email` → the app shows
   *"Check your inbox — we just re-sent the verification link"* with a
   **Resend** button (60 s cooldown).
4. Firebase error codes map to friendly copy (port `firebase-error.tsx` from
   the old app — its table of codes is correct).

### Register
Client-side Firebase, as in the old app and wadzz0:
`createUserWithEmailAndPassword` → `sendEmailVerification` → a
**"Verify your email"** screen (animated envelope, email shown, *Open mail
app*, *Resend*, *I've verified → Sign in*). No server call until first sign-in;
the server creates the `User` row and the Stellar account on that first
sign-in (`getUserPublicKey` → accounts service, `dbUser`).

Fields: name, email, password, confirm password. Password strength meter.
Terms + privacy links.

### Forgot password
`sendPasswordResetEmail(email)` → success state *"If an account exists for
…, a reset link is on its way."* (same copy whether or not it exists — no
account enumeration). Back to sign in.

### Google
`@react-native-google-signin/google-signin` → Google ID token →
`GoogleAuthProvider.credential` → `signInWithCredential` (Firebase) →
Firebase ID token → `POST /auth/session { walletType: "google", email, token }`.

### Apple (iOS)
`expo-apple-authentication` → identity token →
`POST /auth/session { walletType: "apple", email, appleToken }`.
Apple only returns the email on the **first** authorisation — cache it in
SecureStore so a later sign-in can still send it. Required by App Store
because Google is offered. On Android, hide the Apple button.

### Albedo
1. App builds a random `token` message and opens
   `https://albedo.link/?intent=public_key&token=…&callback=<scheme>://auth/albedo`
   in `expo-web-browser` (`openAuthSessionAsync`).
2. Albedo redirects back with `pubkey` + `signature`.
3. `POST /auth/session { walletType: "albedo", pubkey, signature, token }` —
   server verifies with `verifyMessageSignature`.
Albedo users are non-custodial: following a brand needs a second Albedo
round-trip (`tx` intent) — see 02-api → Follow.

## After sign-in: `account_xdr` (decided: same as the old app)

After a successful **email, Google or Apple** sign-in (not Albedo), the app
calls `GET https://accounts.action-tokens.com/api/account_xdr?email=<email>`
and **ignores the response**, exactly like the old app's `Login.tsx`.

- Fire-and-forget: it never blocks or fails sign-in; errors are swallowed.
- Silent: no toast (the old app's "Getting public key…" toast described a
  different call and is dropped).
- Why it's kept: whatever the accounts service does on this call stays in
  effect. The activation helper that would submit the returned XDR
  (`submitActiveAcountXdr`) is dead code in both the old app and
  `connect_wallet` and is **not** ported.
- Observed 2026-09-26 for an existing account: `200 {}`.

## First sign-in: profile setup (decided: skippable sheet)

After the **first** successful sign-in only, show a skippable
"Make it yours" sheet (avatar, display name). Never block the action the user
was trying to do. Full editing (avatar, name, bio, cover) lives in Profile.

## Session lifecycle

- App start: read token from SecureStore → `GET /auth/me` in the background.
  The UI renders immediately from the cached user (same pattern as the web's
  persisted `useAuth`); a 401 clears it silently.
- The token never expires (decision), so there is no refresh.
- Sign out: `DELETE /auth/session` (server no-op), clear SecureStore, clear
  query cache, Firebase `signOut`, Google `signOut`.
- Delete account: Profile → Danger zone → typed confirmation → `DELETE /me`.

## Screens

`auth/sign-in` — one screen, three blocks in this order:
1. **Continue with Apple** (iOS) · **Continue with Google** — full-width.
2. Divider "or".
3. Email + password form · *Forgot password?* · **Sign in** ·
   "New here? **Create account**".
4. Footer: **Use a Stellar wallet (Albedo)** as a quieter text button.

Styled exactly like the rest of the app (arcade palette, Chakra Petch
headings, `ArButton` key-caps), presented as a **full-height sheet** over the
screen that asked for it, so the user never loses their place.
