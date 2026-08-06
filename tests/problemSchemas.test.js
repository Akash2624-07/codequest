// The test-case caps exist for a Judge0 capacity reason, not a product one:
// creation verifies every reference solution against every test case, so peak
// queue depth is languages x cases against a max_queue_size of 150.

const { problemSchema } = require('../src/schemas/problemSchemas');

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
            visibleTestCase: Array.from({ length: 5 }, visible),
            hiddenTestCase: Array.from({ length: 20 }, hidden),
        }));

        expect(result.success).toBe(true);
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
