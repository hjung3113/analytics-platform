# Keycloak as the interim OIDC IdP

FeedbackOps already speaks OIDC (`AUTH_PROVIDER=oidc`, authorization code + PKCE S256), so in-house use can start on a self-hosted Keycloak before the company SSO answer (#150, #151). No application code changes: this page, the realm file and the local compose services are the whole change (#603).

Files: realm [`deploy/keycloak/feedbackops-realm.json`](../../../deploy/keycloak/feedbackops-realm.json), local services in [`docker-compose.dev.yml`](../../../docker-compose.dev.yml) (compose profile `auth`), env block in [`.env.example`](../../../.env.example). OIDC contract: [oidc-and-images.md](oidc-and-images.md).

## What the realm `feedbackops` does

- Self-registration on, email is the username, login with email, duplicate emails off, verify email on, reset password on, brute-force protection on, password policy `length(12)`.
- Only the company domain registers: the `email` attribute of the declarative user profile has a `pattern` validator whose regex comes from `KC_ALLOWED_EMAIL_PATTERN`. The regex is backslash-free (`^[^@]+@example[.]com$`) so it survives JSON encoding and placeholder substitution. Anchor it with `^…$`.
- Keycloak forces email verification before the first login, so FeedbackOps always receives `email_verified: true`.
- Client `feedbackops`: confidential, standard flow only, PKCE S256 required, ID token carries `email`, `email_verified`, `name`, `preferred_username`.
- Placeholders (`${VAR}`, Keycloak realm-import environment substitution): `KC_ALLOWED_EMAIL_PATTERN`, `FEEDBACKOPS_CLIENT_SECRET`, `FEEDBACKOPS_REDIRECT_URI`, `FEEDBACKOPS_WEB_ORIGIN`, `KC_SMTP_HOST`, `KC_SMTP_PORT`, `KC_SMTP_FROM`, `KC_REALM_FRONTEND_URL`.
- The sign-up rejection text is set as the validator's `error-message` (Korean). Keycloak treats it as an i18n key; if the runtime check shows it is not echoed, the generic "invalid email" message applies and no custom theme is added here.
- Import runs only when the realm does not exist yet. Changing the file later does not update an existing realm; recreate it (local) or change it in the admin console / re-import deliberately (deployment).

## Local run

1. Start the stack (the default `docker compose up` is unchanged; the `auth` profile adds Keycloak :8085 and Mailpit :8025/SMTP 1025):

       cd products/feedbackops
       docker compose -f docker-compose.dev.yml --profile auth up -d

   Keycloak admin console: http://localhost:8085 (admin / admin, local only). The realm import takes some seconds; wait until `http://localhost:8085/realms/feedbackops/.well-known/openid-configuration` answers.
2. Point the backend at it with the `.env.example` block "Keycloak (local, profile auth)": `AUTH_PROVIDER=oidc`, issuer `http://localhost:8085/realms/feedbackops`, client id `feedbackops`, secret `local-dev-secret`, redirect `http://localhost:3011/auth/callback`. Use a throwaway database, not the shared 5434 dev DB (`apps/backend/AGENTS.md` → Verification).
3. Start backend and frontend, open the frontend login and choose the OIDC login.
4. Register with an allowed address (`you@example.com`). An address outside the domain is rejected on the form.
5. Open Mailpit (http://localhost:8025), click the verification link. Login is blocked until then.
6. Log in; FeedbackOps creates an Actor at Role Level `user`. Check `GET /me`.
7. Stop: `docker compose -f docker-compose.dev.yml --profile auth down` (dev-mode Keycloak state is disposable).

## In-house deployment checklist

- Run Keycloak with `start` (not `start-dev`) behind HTTPS, a real database (`KC_DB=postgres`, own database and credentials, not the FeedbackOps one), `KC_HOSTNAME` set to the public HTTPS hostname. Backend `OIDC_ISSUER_URL` must be `https://<host>/realms/feedbackops`.
- Company SMTP relay: set `KC_SMTP_HOST`, `KC_SMTP_PORT`, `KC_SMTP_FROM`; if the relay needs auth/TLS, adjust `smtpServer` in the realm (the file ships with `auth`, `ssl`, `starttls` off, for Mailpit). This is separate from FeedbackOps' own notification mail (`SMTP_*`).
- `KC_ALLOWED_EMAIL_PATTERN`: the company domain, e.g. `^[^@]+@company[.]com$`.
- Client secret: generate a random value, give the same value to Keycloak (`FEEDBACKOPS_CLIENT_SECRET`) and the backend (`OIDC_CLIENT_SECRET`) through the secret store; never use `local-dev-secret`. Set `FEEDBACKOPS_REDIRECT_URI=https://<frontend-host>/auth/callback` and `FEEDBACKOPS_WEB_ORIGIN=https://<frontend-host>`.
- Backend: `AUTH_PROVIDER=oidc` with `NODE_ENV=production` (production refuses `mock`; plain `http` issuer/redirect is refused).
- Change the Keycloak bootstrap admin, restrict the admin console to internal access, and back up the Keycloak database.

## Open for #150 / #151

Email domain, SMTP relay and public HTTPS hostname are unknown until #150/#151 are answered; the values above are placeholders until then. The company SSO answer decides whether Keycloak stays as a broker or is replaced.

## Not implemented

| Item | Reason | Reopen when |
| --- | --- | --- |
| RP-initiated logout (`POST /auth/logout` stays FeedbackOps-only) | Keycloak's SSO session survives FeedbackOps logout, so the next login may skip the password. Acceptable for personal PCs. | A shared or kiosk PC requirement, or the company SSO switch |
| Account linking for the company-SSO switch ([merge design §6](../../../../../docs/integration/feedbackops-merge-design.md), #603) | The company IdP's `sub` is unknown. Rule when it happens: verified email match → move the Actor's `external_id` to the new `sub`, audited, only during the switch window. | #150 is answered |
