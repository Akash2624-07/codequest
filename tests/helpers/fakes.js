// Test doubles for the two external services on the register path: Redis and
// the mailer. Judge0 is deliberately not faked here — nothing in this suite
// touches the submit routes yet, so it would be a double with no caller.
//
// These live in their own module rather than inside setup.js because two places
// need them: setup.js installs them, and test files read what they captured.
// Both resolve to the same instance through Node's require cache.

const redisClient = require('../../src/config/redis');

// ── Redis ───────────────────────────────────────────────────────────────────
// The easy shape. redisClient is a module-level singleton and authServices
// calls it as `redisClient.set(...)` — property access at call time — so it can
// be patched whenever, and require order does not matter.
//
// Backed by a Map rather than returning undefined, so `get` after `set` behaves
// like the real thing. deleteToken() reads a key back before deleting it, and a
// double that always returns undefined would make that path silently wrong.
const redisStore = new Map();

function installRedisFake() {
    vi.spyOn(redisClient, 'set').mockImplementation(async (key, value) => {
        redisStore.set(key, String(value));
        return 'OK';
    });
    vi.spyOn(redisClient, 'get').mockImplementation(async (key) =>
        redisStore.has(key) ? redisStore.get(key) : null   // real client returns null, not undefined
    );
    vi.spyOn(redisClient, 'del').mockImplementation(async (key) =>
        redisStore.delete(key) ? 1 : 0
    );
    vi.spyOn(redisClient, 'exists').mockImplementation(async (key) =>
        redisStore.has(key) ? 1 : 0
    );
}

// ── Mailer ──────────────────────────────────────────────────────────────────
// The hard shape. src/utils/mailer.js is `module.exports = sendVerificationEmail`
// — a bare function, so there is no property to spy on. The only seam is Node's
// require cache: seed it with our own exports before anything requires the real
// module.
//
// Ordering is load-bearing. userController requires the mailer transitively via
// src/app, so this must run before any test file requires the app — which is
// exactly why setup.js calls it at module scope rather than inside a hook.
const sentMail = [];

function installMailerFake() {
    const mailerPath = require.resolve('../../src/utils/mailer');
    require.cache[mailerPath] = {
        id: mailerPath,
        filename: mailerPath,
        loaded: true,
        exports: async (emailId, token) => { sentMail.push({ emailId, token }); },
    };
}

function installFakes() {
    installMailerFake();   // must be first: nothing may have required the mailer yet
    installRedisFake();
}

function resetFakes() {
    redisStore.clear();
    sentMail.length = 0;   // truncate in place; the array reference is shared with tests
}

module.exports = { installFakes, resetFakes, redisStore, sentMail };
