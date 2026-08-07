const { z } = require('zod');

// Derived from LANGUAGE_MAP, so a language the API accepts is always one Judge0
// can run. The frontend's list in frontend/src/schemas/problemSchema.js is a
// separate package and still has to be updated by hand.
const { LANGUAGES } = require('../utils/languages');
const languageEnum = z.enum(LANGUAGES);

// Problem creation verifies every reference solution against every test case, so
// Judge0 sees LANGUAGES.length x (visible + hidden) submissions at once. The
// binding limit is how many can *drain* inside the 60s verify budget, not how
// many the queue accepts. tests/problemSchemas.test.js fails if adding a
// language pushes the worst case past that.
const MAX_VISIBLE_TEST_CASES = 5;
const MAX_HIDDEN_TEST_CASES = 20;

const visibleCase = z.object({
    input: z.string().min(1, 'Input is required'),
    output: z.string().min(1, 'Output is required'),
    explanation: z.string().min(1, 'Explanation is required'),
});

const hiddenCase = z.object({
    input: z.string().min(1, 'Input is required'),
    output: z.string().min(1, 'Output is required'),
});

const starterEntry = z.object({
    language: languageEnum,
    initialCode: z.string().min(1, 'Initial code is required'),
});

const solutionEntry = z.object({
    language: languageEnum,
    completeCode: z.string().min(1, 'Solution code is required'),
});

// Payload for both create and update. `problemCreator` is intentionally absent
// — it's set server-side from the authenticated admin, and validate() strips
// any client-supplied value.
const problemSchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    tags: z.array(z.string().min(1)).min(1, 'Add at least one tag'),
    visibleTestCase: z
        .array(visibleCase)
        .min(1, 'Add at least one visible test case')
        .max(MAX_VISIBLE_TEST_CASES, `At most ${MAX_VISIBLE_TEST_CASES} visible test cases`),
    hiddenTestCase: z
        .array(hiddenCase)
        .min(1, 'Add at least one hidden test case')
        .max(MAX_HIDDEN_TEST_CASES, `At most ${MAX_HIDDEN_TEST_CASES} hidden test cases`),
    startCode: z.array(starterEntry).min(1, 'Add starter code for at least one language'),
    referenceSolution: z
        .array(solutionEntry)
        .min(1, 'Add a reference solution for at least one language'),
});

module.exports = {
    problemSchema,
    languageEnum,
    LANGUAGES,
    MAX_VISIBLE_TEST_CASES,
    MAX_HIDDEN_TEST_CASES,
};
