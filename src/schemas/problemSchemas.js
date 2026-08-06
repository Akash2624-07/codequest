const { z } = require('zod');

// Derived from LANGUAGE_MAP, so a language the API accepts is always one Judge0
// can run. The frontend's list in frontend/src/schemas/problemSchema.js is a
// separate package and still has to be updated by hand.
const { LANGUAGES } = require('../utils/languages');
const languageEnum = z.enum(LANGUAGES);

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
    // Capped because problem creation verifies every reference solution against
    // every test case, so peak Judge0 queue depth is languages x test cases.
    // 5 languages x 25 stays under the instance's max_queue_size of 150.
    visibleTestCase: z
        .array(visibleCase)
        .min(1, 'Add at least one visible test case')
        .max(5, 'At most 5 visible test cases'),
    hiddenTestCase: z
        .array(hiddenCase)
        .min(1, 'Add at least one hidden test case')
        .max(20, 'At most 20 hidden test cases'),
    startCode: z.array(starterEntry).min(1, 'Add starter code for at least one language'),
    referenceSolution: z
        .array(solutionEntry)
        .min(1, 'Add a reference solution for at least one language'),
});

module.exports = { problemSchema, languageEnum, LANGUAGES };
