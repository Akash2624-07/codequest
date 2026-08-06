// Test doubles for the external services on the register path. Judge0 is not
// faked — nothing in this suite touches the submit routes.

const redisClient = require('../../src/config/redis');

const redisStore = new Map();

// Map-backed rather than bare stubs: deleteToken() reads a key back before
// deleting it, and the real client returns null (not undefined) on a miss.
function installRedisFake() {
    vi.spyOn(redisClient, 'set').mockImplementation(async (key, value) => {
        redisStore.set(key, String(value));
        return 'OK';
    });
    vi.spyOn(redisClient, 'get').mockImplementation(async (key) =>
        redisStore.has(key) ? redisStore.get(key) : null
    );
    vi.spyOn(redisClient, 'del').mockImplementation(async (key) =>
        redisStore.delete(key) ? 1 : 0
    );
    vi.spyOn(redisClient, 'exists').mockImplementation(async (key) =>
        redisStore.has(key) ? 1 : 0
    );
}

const sentMail = [];

// mailer.js is `module.exports = fn`, so there is no property to spy on and the
// require cache is the only seam. Must run before anything requires src/app.
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
    installMailerFake();
    installRedisFake();
}

function resetFakes() {
    redisStore.clear();
    sentMail.length = 0;   // truncate in place; tests hold this reference
}

module.exports = { installFakes, resetFakes, redisStore, sentMail };
