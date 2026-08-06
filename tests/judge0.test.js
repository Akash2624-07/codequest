// Runs against a throwaway local HTTP server standing in for Judge0, so the
// polling loop and the error mapping are exercised for real.
//
// The require.cache delete is needed because judge0.js captures
// JUDGE0_BASE_URL at module scope — re-requiring is the only way to point it
// somewhere else.

const http = require('http');

let server, calls, mode;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        calls++;
        if (mode === 'upstreamError') {
            res.statusCode = 503;
            return res.end('{"error":"nope"}');
        }
        const done = mode === 'doneOnSixthPoll' && calls >= 6;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ submissions: [{ status: { id: done ? 3 : 1 } }] }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.JUDGE0_BASE_URL = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const freshClient = () => {
    delete require.cache[require.resolve('../src/utils/judge0')];
    return require('../src/utils/judge0');
};

describe('getSubmissionResults', () => {

    it('backs off between polls instead of hammering Judge0', async () => {
        calls = 0;
        mode = 'doneOnSixthPoll';

        const startedAt = Date.now();
        const results = await freshClient().getSubmissionResults([{ token: 'a' }]);
        const elapsed = Date.now() - startedAt;

        expect(results[0].status.id).toBe(3);
        expect(calls).toBe(6);
        // 100 + 200 + 400 + 800 + 1000 = 2500ms of backoff before the 6th poll.
        expect(elapsed).toBeGreaterThan(2000);
    });

    it('honours a caller-supplied budget', async () => {
        calls = 0;
        mode = 'alwaysPending';

        const startedAt = Date.now();
        await expect(freshClient().getSubmissionResults([{ token: 'a' }], 400))
            .rejects.toMatchObject({ name: 'AppError', statusCode: 504 });

        // Gives up on its own budget, not the 20s default.
        expect(Date.now() - startedAt).toBeLessThan(2000);
    });

    it('reports a Judge0 error response as 502, not 500', async () => {
        calls = 0;
        mode = 'upstreamError';

        await expect(freshClient().getSubmissionResults([{ token: 'a' }]))
            .rejects.toMatchObject({ name: 'AppError', statusCode: 502 });
    });

    it('reports an unreachable Judge0 as 503, not 500', async () => {
        process.env.JUDGE0_BASE_URL = 'http://127.0.0.1:1';   // nothing listening

        await expect(freshClient().getSubmissionResults([{ token: 'a' }]))
            .rejects.toMatchObject({ name: 'AppError', statusCode: 503 });
    });
});
