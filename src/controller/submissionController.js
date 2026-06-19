const Problem = require('../models/problem');
const Submission = require('../models/submission');
const { getLanguageId, submitBatch, getSubmissionResults } = require('../utils/judge0');
const decode = (str) => str ? Buffer.from(str, 'base64').toString('utf-8') : null;
const submitCode = async (req, res) => {
    try {
        const userId = req.result._id;
        const problemId = req.params.id;
        const { code, language } = req.body;

        if (!problemId || !code || !language)
            return res.status(400).send("Some fields are missing");

        const problem = await Problem.findById(problemId);
        if (!problem)
            return res.status(404).send("Problem not found");

        const { visibleTestCase, hiddenTestCase } = problem;
        const totalTestCases = [...visibleTestCase, ...hiddenTestCase];

        const submittedResult = await Submission.create({
            userId,
            problemId,
            code,
            language,
            status: "pending",
            totalTestCases: totalTestCases.length
        });

        // Make submissions object to send to Judge0
        const languageId = getLanguageId(language);
        const submissions = totalTestCases.map(({ input, output }) => ({
            language_id: languageId,
            source_code: code,
            stdin: input,
            expected_output: output,
        }));

        // Submit to Judge0
        const tokenObjects = await submitBatch(submissions);
        const results = await getSubmissionResults(tokenObjects);


        // Judge0 status ids:
        // 3  = Accepted
        // 4  = Wrong Answer
        // 5  = Time Limit Exceeded
        // 6  = Compilation Error
        // 7  = Runtime Error (SIGSEGV)
        // 8  = Runtime Error (SIGXFSZ)
        // 9  = Runtime Error (SIGFPE)
        // 10 = Runtime Error (SIGABRT)
        // 11 = Runtime Error (NZEC)
        // 12 = Runtime Error (Other)
        // 13 = Internal Error
        // 14 = Exec Format Error

        const RUNTIME_ERROR_IDS = new Set([7, 8, 9, 10, 11, 12]);

        let status = "accepted",
            runTime = null,
            memory = null,
            testCasesPassed = 0,
            failedCase = null;

        for (const testResult of results) {
            if (testResult.status.id === 3) {
                testCasesPassed++;
                runTime = Math.max(runTime ?? 0, parseFloat(testResult.time) || 0);
                memory = Math.max(memory ?? 0, testResult.memory ?? 0);
            } else {
                const statusId = testResult.status.id;

                // Determine top-level status
                if (statusId === 4) {
                    status = "wrong";
                } else if (statusId === 5) {
                    status = "tle";
                } else if (statusId === 6 || RUNTIME_ERROR_IDS.has(statusId)) {
                    status = "error";
                } else {
                    status = "error"; // 13, 14 — Judge0 internal/format errors
                }

                failedCase = {
                    input: totalTestCases[testCasesPassed].input,
                    expectedOutput: totalTestCases[testCasesPassed].output,
                    actualOutput: decode(testResult.stdout) ?? null,
                    errorMessage: decode(testResult.stderr) ?? decode(testResult.compile_output) ?? decode(testResult.message) ?? null,
                };

                break;
            }
        }

        submittedResult.status = status;
        submittedResult.testCasesPassed = testCasesPassed;
        submittedResult.runTime = status === "accepted" ? runTime : null;
        submittedResult.memory = status === "accepted" ? memory : null;
        submittedResult.failedCase = failedCase;

        await submittedResult.save();
        res.status(201).send(submittedResult);

    } catch (err) {
        res.status(500).send("Internal Server Error " + err);
    }
}

module.exports = submitCode;