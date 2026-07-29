const { ZodError } = require('zod');
const AppError = require('../utils/AppError');

// Central Express error handler. Controllers let errors bubble up here
// (Express 5 forwards both thrown and rejected async errors automatically),
// so every status-code decision lives in one place instead of a copy-pasted
// catch block in each controller.
//
// The 4th arg (next) is required for Express to treat this as an error handler,
// even though it's unused.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    // Input validation failure raised by the validate() middleware.
    if (err instanceof ZodError) {
        const errors = err.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
        // The frontend reads `.message`; surface the first specific issue there
        // and keep the full list under `errors`.
        return res.status(400).json({ message: err.issues[0].message, errors });
    }

    // Expected, client-facing errors thrown by controllers.
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ message: err.message });
    }

    // Mongoose: duplicate unique key (emailId is the only unique field).
    if (err.code === 11000) {
        return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Mongoose: document failed schema validation.
    if (err.name === 'ValidationError') {
        return res.status(400).json({ message: err.message });
    }

    // Mongoose: a malformed value, most often a bad ObjectId in a route param.
    if (err.name === 'CastError') {
        return res.status(400).json({ message: `Invalid ${err.path}` });
    }

    // Anything else is unexpected — log the real error server-side, but don't
    // leak internals to the client.
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
};

module.exports = errorHandler;
