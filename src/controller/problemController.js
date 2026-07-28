const Problem = require('../models/problem');
const { getLanguageId, submitBatch, getSubmissionResults } = require('../utils/judge0');

const createProblem = async (req, res) => {
    // Admin is verified : True

    const { title, description, difficulty, tags, visibleTestCase, hiddenTestCase, startCode, referenceSolution, problemCreator } = req.body;

    // Check if the reference soln is correct
    try {

        if (!visibleTestCase?.length)
            throw new Error("Visible test cases cannot be empty");

        if (!hiddenTestCase?.length)
            throw new Error("Hidden test cases cannot be empty");

        const totalTestCases = [...visibleTestCase, ...hiddenTestCase];

        // referenceSolution : [{}, {}, {}];
        // Each language's Judge0 verification is independent of the others,
        // so run them concurrently instead of one language at a time.
        const verifications = await Promise.all(referenceSolution.map(async ({ language, completeCode }) => {
            const languageId = getLanguageId(language);

            const submissions = totalTestCases.map(({ input, output }) => ({
                language_id: languageId,
                source_code: completeCode,
                stdin: input,
                expected_output: output,
            }));

            // Submit to Judge0
            const tokenObjects = await submitBatch(submissions);
            const results = await getSubmissionResults(tokenObjects);

            // Judge 0 status id 3 = Accepted
            const failedCase = results.find(r => r.status.id !== 3);
            return failedCase ? { language, failedCase } : null;
        }));

        const failed = verifications.find(v => v !== null);
        if (failed) {
            return res.status(400).send(`Reference solution for ${failed.language} failed: ${failed.failedCase.status.description}`);
        }

        // All solutions validated, safe to save
        const problem = await Problem.create({ ...req.body, problemCreator: req.result._id });

        res.status(201).json({ message: "Problem created successfully", problem });

    }
    catch (err) {
        res.status(500).send("Error: " + err.message);
    }

};

const updateProblem = async (req, res) => {
    const { id } = req.params;
    const { title, description, difficulty, tags, visibleTestCase, hiddenTestCase, startCode, referenceSolution, problemCreator } = req.body;

    try {

        if (!id)
            return res.status(400).send("Missing ID Field");

        const problem = await Problem.findById(id);

        if (!problem)
            return res.status(404).send("Problem is Missing");

        if (!visibleTestCase?.length)
            throw new Error("Visible test cases cannot be empty");

        if (!hiddenTestCase?.length)
            throw new Error("Hidden test cases cannot be empty");

        const totalTestCases = [...visibleTestCase, ...hiddenTestCase];

        const verifications = await Promise.all(referenceSolution.map(async ({ language, completeCode }) => {
            const languageId = getLanguageId(language);

            const submissions = totalTestCases.map(({ input, output }) => ({
                language_id: languageId,
                source_code: completeCode,
                stdin: input,
                expected_output: output,
            }));

            // Submit to Judge0
            const tokenObjects = await submitBatch(submissions);
            const results = await getSubmissionResults(tokenObjects);

            const failedCase = results.find(r => r.status.id !== 3);
            return failedCase ? { language, failedCase } : null;
        }));

        const failed = verifications.find(v => v !== null);
        if (failed) {
            return res.status(400).send(`Reference solution for ${failed.language} failed: ${failed.failedCase.status.description}`);
        }

        // All solutions validated, safe to save
        const newProblem = await Problem.findByIdAndUpdate(id, { ...req.body, problemCreator: req.result._id }, { runValidators: true, new: true });

        res.status(200).json({ message: "Problem updated successfully", newProblem });
    }
    catch (err) {
        res.status(500).send("Error: " + err.message);
    }
}

const deleteProblem = async (req, res) => {

    const { id } = req.params;
    try {

        if (!id)
            return res.status(400).send("Missing ID Field");

        const problem = await Problem.findByIdAndDelete(id);

        if (!problem)
            return res.status(404).send("Problem is Missing");

        res.status(200).send("Successfully Deleted");
    }
    catch (err) {
        res.status(500).send("Error: " + err.message);
    }
}

const getProblemById = async (req, res) => {

    const { id } = req.params;
    try {

        if (!id)
            return res.status(400).send("Missing ID FIeld");

        // Admins get the full document (needed to prefill the edit form);
        // everyone else gets the player-safe view with answers stripped.
        const query = Problem.findById(id);
        if (req.result.role !== 'admin')
            query.select('-hiddenTestCase -referenceSolution -problemCreator');

        const problem = await query;

        if (!problem)
            return res.status(404).send("Problem Not Found");

        res.status(200).send(problem);
    }
    catch (err) {
        res.status(500).send("Error: " + err.message);
    }
}

const getAllProblem = async (req, res) => {

    try {
        const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 10, 50));
        const cursor = req.query.cursor;

        const query = cursor
            ? { _id: { $gt: cursor } }
            : {};

        const problem = await Problem.find(query)
            .limit(limit)
            .sort({ _id: 1 })
            .select('_id title difficulty tags');

        const nextCursor = problem.length === limit
            ? problem[problem.length - 1]._id
            : null;

        res.status(200).json({
            problem,
            nextCursor,
            hasMore: nextCursor !== null
        });

    }
    catch (err) {
        res.status(500).send("Error: " + err.message);
    }
}

const solvedProblemsbyUser = async (req, res) => {

    try {

        await req.result.populate({
            path: "problemSolved",
            select: "_id title tags difficulty"
        });

        res.status(200).send(req.result.problemSolved);

    }
    catch (err) {
        res.status(500).send("Error: " + err.message);
    }
}


module.exports = { createProblem, updateProblem, deleteProblem, getProblemById, getAllProblem, solvedProblemsbyUser };