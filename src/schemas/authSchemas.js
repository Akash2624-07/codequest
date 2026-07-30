const { z } = require('zod');

// Password policy — mirrors frontend src/schemas/authSchemas.js. This server
// copy is the authoritative one; the client copy only exists for instant UX.
const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number')
    .regex(/[^A-Za-z0-9]/, 'Password must include a symbol');

// Registration payload. Only the fields a user is allowed to set are listed —
// role/isVerified/problemSolved are intentionally absent, so validate() strips
// them if a client tries to send them.
const registerSchema = z.object({
    firstName: z
        .string()
        .min(2, 'First name must be at least 2 characters')
        .max(20, 'First name must be at most 20 characters'),
    lastName: z
        .string()
        .min(2, 'Last name must be at least 2 characters')
        .max(20, 'Last name must be at most 20 characters')
        .optional(),
    emailId: z.string().email('Enter a valid email address'),
    age: z.number().int().min(6).max(100).optional(),
    password: passwordSchema,
});

// Login only needs to guarantee both fields are strings. emailId being a
// string is what closes the NoSQL-operator injection here: a body like
// { "emailId": { "$ne": null } } is an object, fails this check, and never
// reaches Mongoose. Password policy isn't re-checked — bcrypt is the real gate.
const loginSchema = z.object({
    emailId: z.string().email('Enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
});

const resendVerificationSchema = z.object({
    emailId: z.string().email('Enter a valid email address'),
});

const updateRoleSchema = z.object({
    role: z.enum(['user', 'admin']),
});

module.exports = {
    registerSchema,
    loginSchema,
    resendVerificationSchema,
    updateRoleSchema,
};
