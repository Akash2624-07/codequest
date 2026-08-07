// Single source of truth for supported languages. LANGUAGES is derived rather
// than written out again, so the set the API accepts and the set Judge0 can run
// cannot drift apart.
//
// Ids are Judge0's language_id values. Adding a language here is all the
// backend needs; frontend/src/schemas/problemSchema.js keeps its own list for
// the UI and must be updated alongside.
const LANGUAGE_MAP = {
    "cpp": 54,
    "c": 50,
    "java": 62,
    "python": 71,
    "javascript": 63,
};

const LANGUAGES = Object.keys(LANGUAGE_MAP);

module.exports = { LANGUAGE_MAP, LANGUAGES };
