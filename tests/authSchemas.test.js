// Test A — no DB, no HTTP. Pure validation logic.
//
// Regression test for 708cffa. An HTML number input posts the string "25", not
// the number 25, and Mongoose used to cast that silently — which meant garbage
// like "" or true could also slip through as 0 and 1. z.coerce.number() moves
// the conversion into validation, where it is explicit and assertable.

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
        expect(typeof result.data.age).toBe('number');   // the actual regression
    });
});
