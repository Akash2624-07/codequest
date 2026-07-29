const Problem = require('../models/problem');
const Submission = require('../models/submission');
const { getLanguageId, submitBatch, getSubmissionResults } = require('../utils/judge0');


const decode = (str) => str ? Buffer.from(str, 'base64').toString('utf-8') : null;

const submitCode = async (req, res) => {
    try {
        const userId = req.user._id;
        const problemId = req.params.id;
        const { code, language } = req.body;

        if (!problemId || !code || !language)
            return res.status(400).json({ message: "Some fields are missing" });

        const problem = await Problem.findById(problemId);
        if (!problem)
            return res.status(404).json({ message: "Problem not found" });

        const { visibleTestCase, hiddenTestCase } = problem;
        const totalTestCases = [...visibleTestCase, ...hiddenTestCase];

        // Make submissions object to send to Judge0
        const languageId = getLanguageId(language);
        const submissions = totalTestCases.map(({ input, output }) => ({
            language_id: languageId,
            source_code: code,
            stdin: input,
            expected_output: output,
        }));

        // The pending-submission write doesn't depend on the Judge0 call
        // (or vice versa), so run them concurrently.
        const [submittedResult, tokenObjects] = await Promise.all([
            Submission.create({
                userId,
                problemId,
                code,
                language,
                status: "pending",
                totalTestCases: totalTestCases.length
            }),
            submitBatch(submissions)
        ]);
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

        if (status === "accepted") {
            const alreadySolved = req.user.problemSolved.some(id => id.toString() === problemId);
            if (!alreadySolved) {
                req.user.problemSolved.push(problemId);
                await req.user.save();
            }
        }

        res.status(201).json(submittedResult);

    } catch (err) {
        res.status(500).json({ message: "Internal Server Error: " + err.message });
    }
}

const runCode = async (req, res) => {
    try {

        const problemId = req.params.id;
        const { code, language } = req.body;

        if (!problemId || !code || !language)
            return res.status(400).json({ message: "Some fields are missing" });

        const problem = await Problem.findById(problemId);
        if (!problem)
            return res.status(404).json({ message: "Problem not found" });

        const { visibleTestCase } = problem;

        // Make submissions object to send to Judge0
        const languageId = getLanguageId(language);
        const submissions = visibleTestCase.map(({ input, output }) => ({
            language_id: languageId,
            source_code: code,
            stdin: input,
            expected_output: output,
        }));

        // Submit to Judge0
        const tokenObjects = await submitBatch(submissions);
        const results = await getSubmissionResults(tokenObjects);

        const output = visibleTestCase.map((testCase, index) => ({
            input: testCase.input,
            expectedOutput: testCase.output,
            actualOutput: decode(results[index].stdout),
            passed: results[index].status.id === 3,
            errorMessage: decode(results[index].stderr) ?? decode(results[index].compile_output) ?? decode(results[index].message) ?? null
        }));

        res.status(200).json(output);

    } catch (err) {
        res.status(500).json({ message: "Internal Server Error: " + err.message });
    }
}

const getSubmissions = async (req, res) => {

    try {
        const userId = req.user._id;
        const problemId = req.params.id;

        const submissions = await Submission.find({ userId, problemId });

        res.status(200).json(submissions);

    }
    catch (err) {
        res.status(500).json({ message: "Error: " + err.message });
    }
}

const getAllSubmissions = async (req, res) => {

    try {

        const userId = req.user._id;

        const submissions = await Submission.find({ userId });

        res.status(200).json(submissions);

    }
    catch (err) {
        res.status(500).json({ message: "Error: " + err.message });
    }
}


const getSubmissionsForUser = async (req, res) => {

    try {
        const { userId } = req.params;

        const submissions = await Submission.find({ userId })
            .populate('problemId', 'title difficulty')
            .populate('userId', 'firstName lastName emailId')
            .sort({ createdAt: -1 });

        res.status(200).json(submissions);

    }
    catch (err) {
        res.status(500).json({ message: "Error: " + err.message });
    }
}

module.exports = { submitCode, runCode, getSubmissions, getAllSubmissions, getSubmissionsForUser };