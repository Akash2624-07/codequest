const axios = require('axios');
const AppError = require('./AppError');

// Language Map 
const LANGUAGE_MAP = {
    "cpp": 54,
    "c": 50,
    "java": 62,
    "python": 71,
    "javascript": 63,

}

const getLanguageId = (language) => {
    const id = LANGUAGE_MAP[language.toLowerCase()];
    if (!id) {
        throw new Error(`Unsupported Language: ${language}`);
    }

    return id;
}

// Judge0 Client (Self-Hosted Instance)
const judge0Client = axios.create({
    // axios defaults to no timeout, so without this a stalled Judge0 holds the
    // request open until the browser or a proxy gives up. Kept well under the
    // poll budgets below so one hung call cannot consume the whole budget.
    timeout: 10000,
    headers: { "Content-Type": "application/json" }
});

// Read env per request, not at module load: captured at module scope these
// would be fixed to whatever process.env held the first time this file was
// required, which is the same trap config/redis.js falls into.
judge0Client.interceptors.request.use((config) => {
    config.baseURL = process.env.JUDGE0_BASE_URL;
    config.headers['X-Auth-Token'] = process.env.JUDGE0_AUTH_TOKEN;
    return config;
});

// Judge0 is upstream, so its failures are gateway errors — neither our bug nor
// the client's bad input. Translating here keeps axios internals (and the
// base URL) out of the response body.
judge0Client.interceptors.response.use(
    (response) => response,
    (error) => {
        // The interceptor is the last place that still has the real error, and
        // errorHandler only logs non-AppErrors.
        console.error('[judge0]', error.code ?? '', error.response?.status ?? '', error.message);

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            throw new AppError(504, 'Code execution service did not respond in time.');
        }
        if (error.response) {
            throw new AppError(502, 'Code execution service rejected the request.');
        }
        throw new AppError(503, 'Code execution service is unavailable.');
    }
);

// Submit batch of test cases, get back tokens
const submitBatch = async (submissions) => {
    const response = await judge0Client.post(
        "/submissions/batch?base64_encoded=false",
        { submissions }
    );

    // A partially accepted batch comes back with error objects in place of some
    // tokens. Left unchecked those become the string "undefined" in the polling
    // query, which Judge0 answers for the tokens it does recognise — so the
    // results silently misalign with the test cases they are indexed against.
    const tokens = response.data;
    const usable = Array.isArray(tokens)
        && tokens.length === submissions.length
        && tokens.every(t => t?.token);

    if (!usable) {
        throw new AppError(502, 'Code execution service did not accept every submission.');
    }

    return tokens; // [{ token: "abc..." }, { token: "def..." }, ...]
}

const sleep = (ms)=> new Promise(resolve => setTimeout(resolve,ms));

// Bounded by wall-clock time rather than an attempt count: what matters is how
// long the user waits, and time-per-attempt is not ours to predict — Judge0
// compiles as well as runs, so a cold C++ or Java build can take seconds.
const POLL_BUDGET_MS = 20000;
const POLL_MIN_DELAY_MS = 100;
const POLL_MAX_DELAY_MS = 1000;

// Problem creation verifies every reference solution against every test case,
// so it queues languages x test cases submissions where submit/run queues one
// set. Judge0 drains at COUNT=6 regardless, so the wait is proportionally
// longer and needs its own budget.
const VERIFY_POLL_BUDGET_MS = 60000;

// Token polling to get actual data
const getSubmissionResults = async (tokens, budgetMs = POLL_BUDGET_MS) => {
    const tokenString = tokens.map(t => t.token).join(",");

    const deadline = Date.now() + budgetMs;
    let delay = POLL_MIN_DELAY_MS;

    while (true) {

        const { data } = await judge0Client.get(
            `/submissions/batch?tokens=${tokenString}&base64_encoded=true&fields=*`
        );

        const results = data.submissions;
        // 1 = In Queue, 2 = Processing. Anything else is a final verdict.
        const allDone = results.every(r => r.status.id!==1 && r.status.id !==2);

        if (allDone){
            return results;
        }

        // Back off so a slow run costs a handful of requests, not dozens — but
        // never sleep past the deadline.
        if (Date.now() + delay >= deadline) break;
        await sleep(delay);
        delay = Math.min(delay * 2, POLL_MAX_DELAY_MS);
    }

    throw new AppError(504, "Code execution timed out. Please try again.");
}


module.exports = { getLanguageId, submitBatch, getSubmissionResults, VERIFY_POLL_BUDGET_MS };