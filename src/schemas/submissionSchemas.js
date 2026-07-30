const { z } = require('zod');
const { languageEnum } = require('./problemSchemas');

// Shared by /submit and /run — both take source code plus a language. The
// problem id comes from the route param, so it isn't part of the body schema.
const submitSchema = z.object({
    code: z.string().min(1, 'Code is required'),
    language: languageEnum,
});

module.exports = { submitSchema };
