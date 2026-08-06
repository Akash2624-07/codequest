// Verifies the doubles are what the app code resolves, not just objects this
// file happens to own. Everything below goes through the real modules in src/.

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

        expect(redisStore.get(`verify:token:${token}`)).toBe('user_abc');
        expect(redisStore.get(`verify:user:user_abc`)).toBe(token);
        expect(await verifyToken(token)).toBe('user_abc');
    });

    it('deleteToken clears both keys — the register rollback path', async () => {
        const token = await generateToken('user_xyz');
        expect(redisStore.size).toBe(2);

        await deleteToken('user_xyz');

        expect(redisStore.size).toBe(0);
        expect(await verifyToken(token)).toBeNull();
    });

    it('double state is reset between tests, like the collections are', () => {
        expect(sentMail).toHaveLength(0);
        expect(redisStore.size).toBe(0);
    });
});
