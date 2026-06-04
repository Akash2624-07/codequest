const axios = require('axios');

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
    baseURL: process.env.JUDGE0_BASE_URL,
    headers: { "Content-Type": "application/json" }
});

// Submit batch of test cases, get back tokens 
const submitBatch = async (submissions) => {
    const response = await judge0Client.post(
        "/submissions/batch?base64_encoded=false",
        { submissions }
    );
    return response.data; // [{ token: "abc..." }, { token: "def..." }, ...]
}

// Token polling to get actual data
const getSubmissionResults = async (tokens) => {
    const tokenString = tokens.map(t => t.token).join(",");
    const { data } = await judge0Client.get(
        `submissions/batch?tokens=${tokenString}&base64_encoded=false`
    );
    return data.submissions;
}


module.exports = { getLanguageId, submitBatch, getSubmissionResults };