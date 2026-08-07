const { z } = require('zod');

// Validation only — the app keeps reading process.env directly. No .default()
// values here on purpose: nothing reads the parsed object, so a default in this
// schema would claim something that never reaches the code.
//
// PORT is absent because src/index.js already falls back to 3000, and
// CLIENT_URL because src/app.js falls back to the dev origin.
const envSchema = z.object({
    DB_CONNECT_URI: z.string().startsWith('mongodb'),
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.string().regex(/^\d+$/, 'must be a port number'),
    REDIS_PASSWORD: z.string().min(1),
    JWT_SECRET_KEY: z.string().min(32, 'should be at least 32 characters'),
    JUDGE0_BASE_URL: z.string().url(),
    JUDGE0_AUTH_TOKEN: z.string().min(1),
    EMAIL_USER: z.string().email(),
    EMAIL_PASS: z.string().min(1),
});

// Called from src/index.js only — never from app.js, so tests are unaffected.
module.exports = function validateEnv() {
    const result = envSchema.safeParse(process.env);
    if (result.success) return;

    // Keys and constraints only. zod never echoes the offending value, which
    // matters here: this runs at boot, before anything could redact one.
    console.error('Invalid environment — see .env.example:');
    for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
};
