// An error we deliberately want the client to see, carrying the HTTP status it
// should map to. Controllers `throw new AppError(status, message)` for expected
// failures (bad input, not found, unauthorized) and the central error handler
// turns it into that response instead of a generic 500.
class AppError extends Error {
    // `options` is Error's own { cause }. Pass the error you are wrapping and
    // console.error prints the whole chain, so translating an upstream failure
    // into a client-facing status no longer discards what actually happened.
    constructor(statusCode, message, options) {
        super(message, options);
        this.statusCode = statusCode;
        this.name = 'AppError';
    }
}

module.exports = AppError;
