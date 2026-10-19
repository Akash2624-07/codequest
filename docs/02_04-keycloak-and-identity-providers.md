# 02_04 · Keycloak and identity providers

_A discussion from 2026-09-25. It is an architecture decision
record (a short document that writes down one design decision and the reasons
for it). It is linked to `02-architecture.md` §2.6 and §7 (the authentication
sections) and to `02_01` (sessions vs JWT)._

## What this is about, in one paragraph

An **identity provider** is a separate service whose whole job is handling
logins: it stores users, checks passwords and tells other apps who someone is.
Keycloak is a popular open-source one. This document asks whether CodeQuest
should use Keycloak instead of writing its own login system. The answer is
**no**, at least for now. CodeQuest is a learning project, and building login
by hand is exactly what Phase 1 is meant to teach. Keycloak would also be heavy
for the small server CodeQuest runs on. The document also explains when
Keycloak *is* the right choice, suggests a better place to learn it (the
homelab), and lists the signs that would make it worth reconsidering later.

**The decision:** no Keycloak (and no other external identity provider) for
CodeQuest's own login. Phase 1 builds authentication by hand, for learning.
That means:

- **argon2id** for password hashing (turning passwords into a form that can be
  checked but not reversed),
- **email verification**,
- **Redis sessions** (as decided in `02_01`),
- **Google and GitHub OAuth with PKCE** ("Sign in with Google / GitHub"; PKCE
  is an extra safety step in that flow that stops a stolen login code from
  being used by someone else).

Only reconsider if one of the triggers listed in Topic 6 appears.

---

## Topic 1: What Keycloak is

Keycloak is an open-source **identity server**. It was originally made by Red
Hat and is now a CNCF project (the Cloud Native Computing Foundation, the group
that also looks after Kubernetes). It runs as its own separate service and
handles everything about who your users are:

- **It becomes your login system.** Your app sends users to Keycloak's login
  page. After they log in, Keycloak sends them back to your app with tokens. It
  speaks the standard login protocols: OpenID Connect (OIDC), OAuth 2.0 and
  SAML (an older standard common in big companies).
- **It holds the users.** Registration, password hashing, email verification,
  password reset, MFA (multi-factor authentication, such as a code from your
  phone), and locking an account after too many failed logins.
- **It connects other login providers.** "Sign in with Google / GitHub" is
  set up by filling in settings in its admin console, not by writing code.
- **One login across many apps (SSO, single sign-on).** You log in once, and
  every app that trusts that Keycloak already knows who you are.
- **An admin console** for managing users, roles and sessions, including "log
  this user out everywhere".

It is written in Java and needs its own SQL database. It supports Postgres,
MySQL and others, but **not MongoDB**, which is what CodeQuest uses.

---

## Topic 2: What it would change in CodeQuest

The left column is what you would build yourself in Phase 1. The right column
is what happens instead if Keycloak does it, and you only configure it.

| Phase 1 as planned (you build it) | With Keycloak (you configure it) |
|---|---|
| argon2id hashing, email verification, password reset | Keycloak does it |
| The Google/GitHub OAuth flow with PKCE and `state`, written by hand | Keycloak does it; your app only talks OIDC to Keycloak |
| Account linking on verified email | Keycloak does it |
| Redis sessions, `requireAuth`, "log out everywhere" | Tokens come from Keycloak; revoking them follows the trade-offs in `02_01` |
| Rate limiting on login | Keycloak's brute-force protection |

A few terms from the table:

- **`state`** is a random value sent at the start of the OAuth flow and
  checked when the user comes back, so an attacker can't inject their own
  login response.
- **Account linking on verified email** means that if someone signs in with
  Google using the same verified email as an existing account, the two are
  joined into one account.
- **Rate limiting** means limiting how many login attempts can be made in a
  given time, to slow down password guessing.

**The bigger change is about tokens.** With Keycloak, the service that issues
the login tokens (Keycloak) is not the service that checks them (your API).
That is exactly the situation described in `02_01` Topic 2, where JWTs make
sense. So the API would have to do one of two things:

- verify the JWTs that Keycloak issues, or
- keep a session cookie with the browser and hold Keycloak's tokens on the
  server. This setup is called a "backend-for-frontend": the backend sits
  between the browser and Keycloak and keeps the tokens away from the browser.

---

## Topic 3: Why not for CodeQuest v1

There are four reasons.

**1. It defeats Phase 1's learning goal.** Phase 1 exists to teach OAuth, PKCE,
sessions, password hashing and account linking **by building them**. With
Keycloak you would learn to *configure Keycloak* instead: its realms, clients,
mappers and flows (Keycloak's own settings concepts). That is a different
skill, and a narrower one.

**2. It's heavy for this setup.** Running it means:

- A JVM service (Java programs run inside the Java Virtual Machine) that uses
  around 1 GB of RAM in practice.
- Its own SQL database, a year before the planned move to Postgres.
- Upgrades and backups to look after.
- All of this on the same 4-CPU machine that also runs Judge0 (the service that
  runs users' code submissions).

**3. User data gets split in two.** The identity data (login, email, password)
would live in Keycloak's database, while XP, streaks and progress live in
MongoDB. The two would have to be kept in sync using Keycloak's user id (the
`sub` claim in its tokens).

**4. Changing the login pages is awkward.** Keycloak's pages are customised
with its own template language, or with a tool such as Keycloakify. Making a
distinctive CodeQuest login page that way is harder than just building it in
React.

---

## Topic 4: When Keycloak is the right tool

Keycloak fits well when:

- Several apps need one shared login (SSO).
- There are enterprise requirements: SAML, LDAP or Active Directory (company
  user directories), or MFA policies.
- You have business customers organised into organisations.
- You deliberately don't want to own authentication at all.

Other tools do the same job:

- **Hosted** (someone else runs it for you): Auth0, Clerk.
- **Lighter self-hosted** (you run it, but it is smaller than Keycloak):
  Authentik, Zitadel, Ory.

---

## Topic 5: Where to learn it instead, SSO for the homelab

The same server already runs several self-hosted web apps (dashboards, a chat
UI, a media server), and each one has its own separate login. That is a real
SSO problem. Putting Keycloak in front of them would give single sign-on across
the whole homelab, and most apps like these support OIDC login.

That way you learn Keycloak in a place where it genuinely fits, while
CodeQuest's authentication stays hand-built.

This is a separate project. It is not part of the CodeQuest plan.

---

## Topic 6: Building by hand keeps the option open

The Phase 1 code that handles Google sign-in is an **OIDC client** (code that
logs users in through an OIDC provider). If CodeQuest ever needs Keycloak, it
would simply be one more OIDC provider plugged into that same code, next to
Google. So building by hand now doesn't close the door on Keycloak. It is
actually the path that keeps the option open.

**Reconsider Keycloak if:**

- v3 adds organisations that host private contests, and those organisations
  need their own login rules (for example SSO with their Google Workspace, or
  MFA policies), or
- CodeQuest and other projects need one shared login, or
- looking after authentication becomes a burden rather than a learning
  exercise.

---

## Topic 7: Takeaways

- **"Should I use X?" depends on what you are optimising for.** For a startup
  running in production, *not* writing your own auth is often the right choice
  (Keycloak, Auth0, Clerk). For a learning project, writing it is the whole
  point. This is the same reasoning as for Turborepo in `02_03`: adopt the tool
  once you understand the problem it solves.
- **Keycloak would reverse the `02_01` decision, and for the right reasons.**
  Once logins are issued by a separate service, you are in exactly the
  situation where JWTs fit. Understanding *why* the design uses sessions also
  tells you *when* it should switch.

---

## In short

- Keycloak is a separate login server that handles users, passwords, social
  logins and SSO for you.
- CodeQuest won't use it for v1: Phase 1 is about learning auth by building it,
  and Keycloak would need about 1 GB of RAM plus its own SQL database on a
  shared 4-CPU box.
- It would also split user data between Keycloak and MongoDB, and make custom
  login pages harder.
- Keycloak is the right tool for shared logins across many apps and enterprise
  needs. The homelab is a good place to learn it.
- The hand-built Google sign-in is an OIDC client, so Keycloak could be plugged
  in later if organisations, shared logins or maintenance burden make it worth
  it.
