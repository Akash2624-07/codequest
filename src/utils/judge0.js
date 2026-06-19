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

const sleep = (ms)=> new Promise(resolve => setTimeout(resolve,ms));

// Token polling to get actual data
const getSubmissionResults = async (tokens) => {
    const tokenString = tokens.map(t => t.token).join(",");

    for(let attempts=0; attempts<10; attempts++){

        const { data } = await judge0Client.get(
            `/submissions/batch?tokens=${tokenString}&base64_encoded=true`
        );
        
        const results = data.submissions;
        const allDone = results.every(r => r.status.id!==1 && r.status.id !==2);

        if (allDone){
            return results;
        }
        await sleep(1000);
    }
    throw new Error("Server timed out");
}


module.exports = { getLanguageId, submitBatch, getSubmissionResults };