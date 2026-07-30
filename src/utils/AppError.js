// An error we deliberately want the client to see, carrying the HTTP status it
// should map to. Controllers `throw new AppError(status, message)` for expected
// failures (bad input, not found, unauthorized) and the central error handler
// turns it into that response instead of a generic 500.
class AppError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'AppError';
    }
}

module.exports = AppError;
