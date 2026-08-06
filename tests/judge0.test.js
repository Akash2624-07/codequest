// Runs against a throwaway local HTTP server standing in for Judge0, so the
// polling loop, the batch check and the error mapping are exercised for real.

const http = require('http');
const { submitBatch, getSubmissionResults } = require('../src/utils/judge0');

let server, baseUrl, calls, mode;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        calls++;
        res.setHeader('content-type', 'application/json');

        if (mode === 'upstreamError') {
            res.statusCode = 503;
            return res.end('{"error":"nope"}');
        }

        if (req.method === 'POST') {
            return res.end(JSON.stringify(
                mode === 'partialBatch'
                    ? [{ token: 'a' }, { error: 'bad language_id' }]
                    : [{ token: 'a' }, { token: 'b' }]
            ));
        }

        const done = mode === 'doneOnSixthPoll' && calls >= 6;
        res.end(JSON.stringify({ submissions: [{ status: { id: done ? 3 : 1 } }] }));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
    calls = 0;
    process.env.JUDGE0_BASE_URL = baseUrl;
});

describe('getSubmissionResults', () => {

    it('backs off between polls instead of hammering Judge0', async () => {
        mode = 'doneOnSixthPoll';

        const startedAt = Date.now();
        const results = await getSubmissionResults([{ token: 'a' }]);

        expect(results[0].status.id).toBe(3);
        expect(calls).toBe(6);
        // 100 + 200 + 400 + 800 + 1000 = 2500ms of backoff before the 6th poll.
        expect(Date.now() - startedAt).toBeGreaterThan(2000);
    });

    it('honours a caller-supplied budget', async () => {
        mode = 'alwaysPending';

        const startedAt = Date.now();
        await expect(getSubmissionResults([{ token: 'a' }], 400))
            .rejects.toMatchObject({ name: 'AppError', statusCode: 504 });

        // Gives up on its own budget, not the 20s default.
        expect(Date.now() - startedAt).toBeLessThan(2000);
    });
});

describe('submitBatch', () => {

    it('rejects a partially accepted batch rather than polling a bad token list', async () => {
        mode = 'partialBatch';

        await expect(submitBatch([{ source_code: 'a' }, { source_code: 'b' }]))
            .rejects.toMatchObject({ name: 'AppError', statusCode: 502 });
    });
});

describe('upstream failure mapping', () => {

    it('reports a Judge0 error response as 502, not 500', async () => {
        mode = 'upstreamError';

        await expect(getSubmissionResults([{ token: 'a' }]))
            .rejects.toMatchObject({ name: 'AppError', statusCode: 502 });
    });

    it('reports an unreachable Judge0 as 503, not 500', async () => {
        process.env.JUDGE0_BASE_URL = 'http://127.0.0.1:1';   // nothing listening

        await expect(getSubmissionResults([{ token: 'a' }]))
            .rejects.toMatchObject({ name: 'AppError', statusCode: 503 });
    });
});
