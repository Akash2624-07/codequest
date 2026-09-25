# 02_04 · Keycloak and identity providers

_Discussion, 2026-09-25. An architecture decision record that relates to
`02-architecture.md` §2.6 and §7 (authentication) and to `02_01`._

**Decision:** **no Keycloak (or any external identity provider) for
CodeQuest's own login.** Phase 1 builds auth by hand for learning: argon2id,
email verification, Redis sessions, and Google/GitHub OAuth with PKCE.
Revisit only if a trigger in §6 appears.

---

## 1. What Keycloak is

An open-source **identity server**, originally from Red Hat and now a CNCF
project. It runs as its own service and handles everything about who users
are:

- **It becomes the login system.** Your app sends users to Keycloak's login
  page, and Keycloak sends them back with tokens. It speaks OpenID Connect,
  OAuth 2.0 and SAML.
- **It holds the users:** registration, password hashing, email verification,
  password reset, MFA, lockout after failed logins.
- **It connects other login providers:** "Sign in with Google / GitHub" is
  configured in its admin console rather than coded.
- **One login across many apps (SSO).** Log in once, and every app trusting
  that Keycloak knows you.
- **An admin console** for users, roles, sessions and "log this user out
  everywhere".

It's written in Java and needs its own SQL database: Postgres, MySQL and
others, but **not MongoDB**.

---

## 2. What it would change in CodeQuest

| Phase 1 as planned (you build it) | With Keycloak (you configure it) |
|---|---|
| argon2id hashing, email verification, password reset | Keycloak does it |
| The Google/GitHub OAuth flow with PKCE and `state`, written by hand | Keycloak does it; your app talks OIDC to Keycloak only |
| Account linking on verified email | Keycloak does it |
| Redis sessions, `requireAuth`, "log out everywhere" | Tokens from Keycloak; revocation per the `02_01` trade-offs |
| Rate limiting on login | Keycloak's brute-force protection |

With Keycloak, the service that issues tokens (Keycloak) isn't the one that
checks them (your API). That's the case from `02_01` §2 where JWTs make sense.
The API would either:

- verify Keycloak's JWTs, or
- keep a session cookie and hold the tokens on the server (a
  "backend-for-frontend" setup).

---

## 3. Why not for CodeQuest v1

1. **It defeats Phase 1's learning goal.** Phase 1 exists to teach OAuth,
   PKCE, sessions, password hashing and account linking by building them.
   With Keycloak you'd learn to *configure* Keycloak (realms, clients,
   mappers, flows). That's a different skill, and a narrower one.
2. **It's heavy for this setup:**
   - A JVM service using around 1 GB of RAM in practice.
   - Its own SQL database, a year before the planned Postgres migration.
   - Upgrades and backups to maintain.
   - All of it on the same 4-CPU box as Judge0.
3. **User data gets split in two.** Identity lives in Keycloak's database,
   while XP, streaks and progress live in MongoDB. The two must be kept in
   sync using Keycloak's user id (the `sub` claim).
4. **Changing the login pages is awkward.** Keycloak's pages are customised
   with its own template language, or with a tool like Keycloakify. A
   distinctive CodeQuest login page is harder than building it in React.

---

## 4. When Keycloak is the right tool

- Several apps need one shared login (SSO).
- Enterprise requirements: SAML, LDAP or Active Directory, MFA policies.
- Business customers with organisations.
- You deliberately don't want to own auth at all.

Other options in the same space:

- **Hosted:** Auth0, Clerk.
- **Lighter self-hosted:** Authentik, Zitadel, Ory.

---

## 5. Where to learn it instead: SSO for the homelab

The same server already runs several self-hosted web apps (dashboards, a chat
UI, a media server), each with its own login. That's a real SSO problem.
Keycloak in front of them gives single sign-on across the homelab, and most
such apps support OIDC login. That teaches Keycloak where it genuinely fits,
while CodeQuest's auth stays hand-built.

It's a separate project, not part of the CodeQuest plan.

---

## 6. Building by hand keeps the option open

The Phase 1 code that handles Google sign-in is an OIDC client. If CodeQuest
ever needs Keycloak, it's just another OIDC provider plugged into that same
code. Building by hand now is the path that keeps the option open.

**Revisit if:**

- v3 adds organisations hosting private contests, and they need their own
  login rules (SSO with their Google Workspace, MFA policies), or
- CodeQuest and other projects need one shared login, or
- maintaining auth becomes a burden rather than a learning exercise.

---

## 7. Takeaways

- **"Should I use X?" depends on what you're optimising for.** For a
  production startup, *not* writing auth is often right (Keycloak, Auth0,
  Clerk). For a learning project, writing it is the point. Same reasoning as Turborepo in `02_03`: adopt the tool once you
  understand the problem it solves.
- **Keycloak would flip the `02_01` decision, for the right reasons.** Once
  login is issued by a separate service, you're in the situation where JWTs
  fit. Knowing why the design uses sessions is also knowing when it should
  switch.
