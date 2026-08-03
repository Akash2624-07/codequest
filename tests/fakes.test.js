// Proves the doubles in tests/helpers/fakes.js are the objects the *app code*
// actually holds — not just objects this file happens to own. Everything here
// goes through the real modules under src/.
//
// Note the destructured require below. Faking generateToken itself would be the
// plan's hard case: the reference is copied once, at require time, so a spy
// installed afterwards would be too late. It doesn't matter, because the double
// is one level deeper — inside authServices, Redis is used as a live property
// lookup, so require order here is irrelevant.

const { generateToken, verifyToken, deleteToken } = require('../src/services/authServices');
const sendVerificationEmail = require('../src/utils/mailer');
const { sentMail, redisStore } = require('./helpers/fakes');

describe('external service doubles', () => {

    it('the mailer the app code resolves is the double', async () => {
        await sendVerificationEmail('someone@example.com', 'tok_123');

        expect(sentMail).toEqual([{ emailId: 'someone@example.com', token: 'tok_123' }]);
    });

    it('generateToken writes both keys to the fake Redis', async () => {
        const token = await generateToken('user_abc');

        // authServices writes a forward and a reverse key; both should be visible.
        expect(redisStore.get(`verify:token:${token}`)).toBe('user_abc');
        expect(redisStore.get(`verify:user:user_abc`)).toBe(token);

        // And reading back through the real service works, which is what proves
        // the double behaves like Redis rather than merely absorbing calls.
        expect(await verifyToken(token)).toBe('user_abc');
    });

    it('deleteToken clears both keys — the register rollback path', async () => {
        const token = await generateToken('user_xyz');
        expect(redisStore.size).toBe(2);

        await deleteToken('user_xyz');

        expect(redisStore.size).toBe(0);
        expect(await verifyToken(token)).toBeNull();   // real client returns null, so the double must too
    });

    it('double state is reset between tests, like the collections are', () => {
        expect(sentMail).toHaveLength(0);
        expect(redisStore.size).toBe(0);
    });
});
