# Keycloak as the interim OIDC IdP

The feature suite already speaks OIDC (`AUTH_PROVIDER=oidc`, authorization code + PKCE S256), so in-house use can start on a self-hosted Keycloak before the company SSO answer (#150, #151). No application code changes: this page, the realm file and the local compose services are the whole change (#603).

Files: realm [`deploy/keycloak/platform-realm.json`](../../../../ops/platform-api/deploy/keycloak/platform-realm.json), local services in [`docker-compose.dev.yml`](../../../../ops/platform-api/docker-compose.dev.yml) (compose profile `auth`), env block in [`.env.example`](../../../../ops/platform-api/.env.example). OIDC contract: [oidc-and-images.md](oidc-and-images.md).

## What the realm `platform` does

- Self-registration on, email is the username, login with email, duplicate emails off, verify email on, reset password on, brute-force protection on, password policy `length(12)`.
- Only the company domain registers: the `email` attribute of the declarative user profile has a `pattern` validator whose regex comes from `KC_ALLOWED_EMAIL_PATTERN`. The regex is backslash-free (`^[^@]+@example[.]com$`) so it survives JSON encoding and placeholder substitution. Anchor it with `^…$`.
- Keycloak forces email verification before the first login, so the feature suite always receives `email_verified: true`.
- With verify email on, Keycloak 26.7 does not ask for a password on the registration form: the user enters email and name, opens the verification mail, then sets the password (Required Action `UPDATE_PASSWORD`). Measured 2026-10-22 on 26.7.5.
- The UI is Korean by default (`defaultLocale: ko`, `ko`/`en` selectable). The profile has one name field, `firstName` labelled `이름 (예: 홍길동)`; `lastName` is removed so the `name` claim, and the 기능 display name, is the full Korean name in one piece ("홍길동", not "길동 홍").
- Client `platform`: confidential, standard flow only, PKCE S256 required, ID token carries `email`, `email_verified`, `name`, `preferred_username`.
- Placeholders (`${VAR}`, Keycloak realm-import environment substitution): `KC_ALLOWED_EMAIL_PATTERN`, `PLATFORM_API_CLIENT_SECRET`, `PLATFORM_API_REDIRECT_URI`, `PLATFORM_API_WEB_ORIGIN`, `KC_SMTP_HOST`, `KC_SMTP_PORT`, `KC_SMTP_FROM`, `KC_REALM_FRONTEND_URL`.
- The sign-up rejection text is set as the validator's `error-message` (Korean). Keycloak treats it as an i18n key; if the runtime check shows it is not echoed, the generic "invalid email" message applies and no custom theme is added here.
- Import runs only when the realm does not exist yet. Changing the file later does not update an existing realm; recreate it (local) or change it in the admin console / re-import deliberately (deployment).

## Local run

1. Start the stack (the default `docker compose up` is unchanged; the `auth` profile adds Keycloak :8085 and Mailpit :8025/SMTP 1025):

       cd ops/platform-api
       docker compose -f docker-compose.dev.yml --profile auth up -d

   Keycloak admin console: http://localhost:8085 (admin / admin, local only). The realm import takes some seconds; wait until `http://localhost:8085/realms/platform/.well-known/openid-configuration` answers.
2. Point the backend at it with the `.env.example` block "Keycloak (local, profile auth)": `AUTH_PROVIDER=oidc`, issuer `http://localhost:8085/realms/platform`, client id `platform`, secret `local-dev-secret`, redirect `http://localhost:3011/auth/callback`. Use a throwaway database, not the shared 5434 dev DB (`apps/platform-api/AGENTS.md` → Verification).
3. Start backend and frontend, open the frontend login and choose the OIDC login.
4. Register with an allowed address (`you@example.com`) and your name. An address outside the domain is rejected on the form with `사내 이메일 주소로만 가입할 수 있습니다.`. The form has no password field; open the verification mail in Mailpit (http://localhost:8025), follow the link, and set a password of at least 12 characters there.
5. Open Mailpit (http://localhost:8025), click the verification link. Login is blocked until then.
6. Log in; feature creates an Actor at Role Level `user`. Check `GET /me`.
7. Stop: `docker compose -f docker-compose.dev.yml --profile auth down` (dev-mode Keycloak state is disposable).

## In-house deployment checklist

- Run Keycloak with `start` (not `start-dev`) behind HTTPS, a real database (`KC_DB=postgres`, own database and credentials, not the feature suite one), `KC_HOSTNAME` set to the public HTTPS hostname. Backend `OIDC_ISSUER_URL` must be `https://<host>/realms/platform`.
- Set `KC_REALM_FRONTEND_URL=https://<host>` too: the realm's `frontendUrl` attribute takes precedence over `KC_HOSTNAME` for this realm, and the local default `http://localhost:8085` would otherwise go into the discovery document's `issuer` and the verification-mail links. After deploying, check that `https://<host>/realms/platform/.well-known/openid-configuration` reports that `issuer`, and that a verification mail's link starts with `https://<host>/`.
- Company SMTP relay: set `KC_SMTP_HOST`, `KC_SMTP_PORT`, `KC_SMTP_FROM`; if the relay needs auth/TLS, adjust `smtpServer` in the realm (the file ships with `auth`, `ssl`, `starttls` off, for Mailpit). This is separate from the feature suite' own notification mail (`SMTP_*`).
- `KC_ALLOWED_EMAIL_PATTERN`: the company domain, e.g. `^[^@]+@company[.]com$`.
- Client secret: generate a random value, give the same value to Keycloak (`PLATFORM_API_CLIENT_SECRET`) and the backend (`OIDC_CLIENT_SECRET`) through the secret store; never use `local-dev-secret`. Set `PLATFORM_API_REDIRECT_URI=https://<frontend-host>/auth/callback` and `PLATFORM_API_WEB_ORIGIN=https://<frontend-host>`.
- Backend: `AUTH_PROVIDER=oidc` with `NODE_ENV=production` (production refuses `mock`; plain `http` issuer/redirect is refused).
- Change the Keycloak bootstrap admin, restrict the admin console to internal access, and back up the Keycloak database.

## Open for #150 / #151

Email domain, SMTP relay and public HTTPS hostname are unknown until #150/#151 are answered; the values above are placeholders until then. The company SSO answer decides whether Keycloak stays as a broker or is replaced.

## Not implemented

| Item | Reason | Reopen when |
| --- | --- | --- |
| RP-initiated logout (`POST /auth/logout` stays feature-only) | Keycloak's SSO session survives feature logout, so the next login may skip the password. Acceptable for personal PCs. | A shared or kiosk PC requirement, or the company SSO switch |
| Account linking for the company-SSO switch ([merge design §6](../../../integration/feedbackops-merge-design.md), #603) | The company IdP's `sub` is unknown. Rule when it happens: verified email match → move the Actor's `external_id` to the new `sub`, audited, only during the switch window. | #150 is answered |

## Realm and client rename (#1100 b)

The realm and the client are now `platform` (file `deploy/keycloak/platform-realm.json`; the release mock IdP client is
`platform-release-local`). The placeholders are `PLATFORM_API_CLIENT_SECRET`, `PLATFORM_API_REDIRECT_URI` and
`PLATFORM_API_WEB_ORIGIN`; the old names are not read. PKCE S256, verified email, the email pattern and the restricted
redirects are unchanged.

### Existing deployment: rename in place, keep the users

A deployment that already runs realm and client `feedbackops` renames those same objects. It does not import a second
realm and no user registers again: users keep their ids, so the token `sub` stays the one stored in
`core.actors.external_id` (`session-service.ts` resolves the actor from `claims.sub`). Re-registering would create new
subject ids and lose that association; do not use that route and do not weaken authentication to compensate.
Source facts (Keycloak 26.7.5, the pinned image): `PUT /admin/realms/{realm}` on a non-master realm renames the
existing realm (only the master realm is protected) and `PUT /admin/realms/{realm}/clients/{client-uuid}` changes
`clientId` on the existing client. Neither recreates users, credentials or the client secret. A rename does not
rewrite other places that mention the old names; those are updated in step 5. This procedure is written from the
[official source](https://github.com/keycloak/keycloak/blob/26.7.5/model/storage-private/src/main/java/org/keycloak/storage/datastore/DefaultExportImportManager.java#L735-L795) and [Admin REST API](https://www.keycloak.org/docs-api/26.7.5/rest-api/). A disposable local 26.7.5 fixture rehearsal (2026-10-29) preserved realm/client UUIDs, user ID and password-login token `sub`, client secret and PKCE/email/redirect policies through rename and rollback. Rehearse on a secured copy of the actual deployment before cutover; this local check does not verify its external references or actor records.

1. **Back up and record.** Take a secure backup of the Keycloak database and realm configuration. Record the realm id,
   the client internal UUID, the client secret hash/rotation date (not the value), several representative user ids
   (including an admin and one with a required action), their role mappings and required actions, and the client
   policies (PKCE S256, redirect URIs, web origins). Never print secrets.
2. **Stop entry.** Stop writes and the login entry (maintenance page or stop the backend) so no session is created
   while the issuer changes.
3. **Rename the client, then the realm.** Authenticate as the admin through the `master` realm with the existing
   operator process. `PUT /admin/realms/feedbackops/clients/<client-uuid>` with the minimal body `{"clientId":"platform"}`
   (release mock client: `platform-release-local`), then `PUT /admin/realms/feedbackops` with `{"realm":"platform"}`.
   Do not send a full representation, do not regenerate the client secret, do not recreate users.
4. **Verify continuity before switching.** In the renamed realm confirm the same realm id and client UUID, the same
   user ids for the recorded users, credentials and required actions intact, role mappings and client policies equal
   to step 1, and the same client secret value. Then log in as a recorded user against a copy or the stopped backend
   and confirm the token `sub` equals the recorded user id and `GET /me` resolves the existing actor (same actor id,
   not a new one).
5. **Switch the application.** Set `OIDC_ISSUER_URL=https://<host>/realms/platform` and `OIDC_CLIENT_ID=platform`
   (the secret value is unchanged), and update the redirect URI / web origin entries that name the old realm or client.
   Restart the backend and re-open the login entry.
6. **Rollback.** Rename the same two objects back (`{"realm":"feedbackops"}`, `{"clientId":"feedbackops"}`), restore the
   previous application env, and restore from the step 1 backup if state differs. A realm and its renamed copy cannot
   both be live, so keep the step 1 backup until the rename is explicitly retired by the operator.

No identity remapping feature and no authentication fallback is added. Local dev Keycloak state is disposable
(`start-dev`), so recreate the container instead of renaming.
