// The test-case caps exist for a Judge0 capacity reason, not a product one:
// creation verifies every reference solution against every test case, so peak
// queue depth is languages x cases against a max_queue_size of 150.

const {
    problemSchema,
    LANGUAGES,
    MAX_VISIBLE_TEST_CASES,
    MAX_HIDDEN_TEST_CASES,
} = require('../src/schemas/problemSchemas');

// Judge0 drains ~4 submissions/sec (COUNT=6 on 4 cores), and problem
// verification is allowed 60s, so roughly this many can finish in budget.
const DRAINABLE_IN_VERIFY_BUDGET = 240;

const visible = () => ({ input: '1 2', output: '3', explanation: 'sums to 3' });
const hidden = () => ({ input: '4 5', output: '9' });

const validProblem = (overrides = {}) => ({
    title: 'Two Sum',
    description: 'Return the indices of the two numbers adding to target.',
    difficulty: 'easy',
    tags: ['array'],
    visibleTestCase: [visible()],
    hiddenTestCase: [hidden()],
    startCode: [{ language: 'cpp', initialCode: '// starter' }],
    referenceSolution: [{ language: 'cpp', completeCode: '// solution' }],
    ...overrides,
});

describe('problemSchema test case limits', () => {

    it('accepts a problem sitting exactly on the cap', () => {
        const result = problemSchema.safeParse(validProblem({
            visibleTestCase: Array.from({ length: MAX_VISIBLE_TEST_CASES }, visible),
            hiddenTestCase: Array.from({ length: MAX_HIDDEN_TEST_CASES }, hidden),
        }));

        expect(result.success).toBe(true);
    });

    // The caps are a Judge0 capacity decision, and adding a language multiplies
    // the worst case. Fail here rather than as a 504 during problem creation.
    it('worst-case verification still fits the drain budget', () => {
        const worstCase = LANGUAGES.length * (MAX_VISIBLE_TEST_CASES + MAX_HIDDEN_TEST_CASES);

        expect(worstCase).toBeLessThanOrEqual(DRAINABLE_IN_VERIFY_BUDGET);
    });

    it('rejects more hidden test cases than the queue can take', () => {
        const result = problemSchema.safeParse(validProblem({
            hiddenTestCase: Array.from({ length: 21 }, hidden),
        }));

        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toBe('At most 20 hidden test cases');
    });

    it('rejects more visible test cases than the queue can take', () => {
        const result = problemSchema.safeParse(validProblem({
            visibleTestCase: Array.from({ length: 6 }, visible),
        }));

        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toBe('At most 5 visible test cases');
    });
});
