// Test B — the full slice. Request goes in at the HTTP layer and everything
// between there and Mongo is real: routing, zod validation, the controller,
// bcrypt, the mongoose model. Only the two genuinely external services are
// doubled (see tests/helpers/fakes.js).
//
// The assertions record what the endpoint *currently* does rather than what it
// arguably should — this is a characterization test. If a refactor changes the
// status code or the body shape, that is a decision to make deliberately, and
// this is what forces the conversation.

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { sentMail, redisStore } = require('./helpers/fakes');

const validPayload = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    emailId: 'ada@example.com',
    age: 36,
    password: 'Str0ng!pass',
};

describe('POST /user/register', () => {

    it('creates exactly one user and sends a verification email', async () => {
        const res = await request(app).post('/user/register').send(validPayload);

        expect(res.status).toBe(201);
        expect(res.body.message).toBe('Verification link successfully sent');
        expect(res.body.userInfo.emailId).toBe('ada@example.com');
        expect(res.body.userInfo.role).toBe('user');

        const users = await mongoose.connection.collection('users').find().toArray();
        expect(users).toHaveLength(1);
        expect(users[0].emailId).toBe('ada@example.com');

        // Nothing may leak the plaintext password, and no response should ever
        // carry a password field at all.
        expect(users[0].password).not.toBe(validPayload.password);
        expect(res.body.userInfo.password).toBeUndefined();

        // The side effects landed on the doubles, not on Gmail and Redis.
        expect(sentMail).toHaveLength(1);
        expect(sentMail[0].emailId).toBe('ada@example.com');
        expect(redisStore.size).toBe(2);   // verify:token: and verify:user:
    });
});
