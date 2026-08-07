// errorHandler decides two things independently: what the client is told, and
// whether anyone on the server ever finds out. Those came apart once upstream
// failures started being wrapped in AppError, so both are pinned here.

const errorHandler = require('../src/middleware/errorHandler');
const AppError = require('../src/utils/AppError');

const fakeRes = () => {
    const res = {};
    res.status = (code) => { res.code = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
};

const handle = (err) => {
    const res = fakeRes();
    errorHandler(err, {}, res, () => {});
    return res;
};

describe('errorHandler', () => {

    let errorLog;
    beforeEach(() => { errorLog = vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => errorLog.mockRestore());

    it('answers a 4xx AppError without logging it', () => {
        const res = handle(new AppError(404, 'Problem not found'));

        expect(res.code).toBe(404);
        expect(res.body).toEqual({ message: 'Problem not found' });
        // Routine. Logging every bad request would bury the real failures.
        expect(errorLog).not.toHaveBeenCalled();
    });

    it('logs a 5xx AppError, cause and all', () => {
        const upstream = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        const res = handle(new AppError(503, 'Code execution service is unavailable.', { cause: upstream }));

        expect(res.code).toBe(503);
        expect(res.body).toEqual({ message: 'Code execution service is unavailable.' });

        // The client is given a status it can act on; the operator needs the
        // cause, which only survives because it was attached.
        expect(errorLog).toHaveBeenCalledTimes(1);
        expect(errorLog.mock.calls[0][0].cause).toBe(upstream);
    });

    it('logs an unrecognised error and tells the client nothing', () => {
        const res = handle(new Error('Cannot read properties of undefined'));

        expect(res.code).toBe(500);
        expect(res.body).toEqual({ message: 'Internal Server Error' });
        expect(res.body.message).not.toContain('undefined');   // no internals leaked
        expect(errorLog).toHaveBeenCalledTimes(1);
    });
});
