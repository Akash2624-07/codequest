// Route-level input validation. Parses req.body against a Zod schema and, on
// success, REPLACES req.body with the parsed result. Because z.object() strips
// unknown keys, downstream `{ ...req.body }` spreads can no longer be used to
// smuggle fields like `role` or `isVerified` — the mass-assignment guard is a
// side effect of validating. On failure the ZodError is forwarded to the
// central error handler, which renders it as a 400.
const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
        return next(result.error);
    }

    req.body = result.data;
    next();
};

module.exports = validate;

