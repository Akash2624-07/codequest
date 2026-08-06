// Full slice: everything between HTTP and Mongo is real, only the external
// services are doubled. Assertions record current behaviour, so a change to the
// status code or body shape has to be deliberate.

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

        expect(users[0].password).not.toBe(validPayload.password);
        expect(res.body.userInfo.password).toBeUndefined();

        expect(sentMail).toHaveLength(1);
        expect(sentMail[0].emailId).toBe('ada@example.com');
        expect(redisStore.size).toBe(2);   // verify:token: and verify:user:
    });
});
