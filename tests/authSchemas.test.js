// Regression test for 708cffa: an HTML number input posts "25", not 25, and
// Mongoose used to cast it silently.

const { registerSchema } = require('../src/schemas/authSchemas');

describe('registerSchema', () => {

    it('coerces a numeric string age into a number', () => {
        const result = registerSchema.safeParse({
            firstName: 'Ada',
            lastName: 'Lovelace',
            emailId: 'ada@example.com',
            age: '25',
            password: 'Str0ng!pass',
        });

        expect(result.success).toBe(true);
        expect(result.data.age).toBe(25);
        expect(typeof result.data.age).toBe('number');
    });
});
