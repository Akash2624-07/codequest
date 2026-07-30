const Problem = require('../models/problem');
const { getLanguageId, submitBatch, getSubmissionResults } = require('../utils/judge0');
const AppError = require('../utils/AppError');

const createProblem = async (req, res) => {

    // req.body is validated + whitelisted by validate(problemSchema); test-case
    // and reference-solution presence is enforced there, not here.
    const { visibleTestCase, hiddenTestCase, referenceSolution } = req.body;
    const totalTestCases = [...visibleTestCase, ...hiddenTestCase];

    // Each language's Judge0 verification is independent of the others, so run
    // them concurrently instead of one language at a time.
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

        // Judge0 status id 3 = Accepted
        const failedCase = results.find(r => r.status.id !== 3);
        return failedCase ? { language, failedCase } : null;
    }));

    const failed = verifications.find(v => v !== null);
    if (failed) {
        throw new AppError(400, `Reference solution for ${failed.language} failed: ${failed.failedCase.status.description}`);
    }

    // problemCreator comes from the authenticated admin, never the client body.
    const problem = await Problem.create({ ...req.body, problemCreator: req.user._id });

    res.status(201).json({ message: "Problem created successfully", problem });
};

const updateProblem = async (req, res) => {

    const { id } = req.params;
    const { visibleTestCase, hiddenTestCase, referenceSolution } = req.body;

    const problem = await Problem.findById(id);
    if (!problem)
        throw new AppError(404, "Problem is Missing");

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
        throw new AppError(400, `Reference solution for ${failed.language} failed: ${failed.failedCase.status.description}`);
    }

    // All solutions validated, safe to save
    const newProblem = await Problem.findByIdAndUpdate(id, { ...req.body, problemCreator: req.user._id }, { runValidators: true, new: true });

    res.status(200).json({ message: "Problem updated successfully", newProblem });
}

const deleteProblem = async (req, res) => {

    const { id } = req.params;

    const problem = await Problem.findByIdAndDelete(id);
    if (!problem)
        throw new AppError(404, "Problem is Missing");

    res.status(200).send("Successfully Deleted");
}

const getProblemById = async (req, res) => {

    const { id } = req.params;

    // Admins get the full document (needed to prefill the edit form); everyone
    // else gets the player-safe view with answers stripped.
    const query = Problem.findById(id);
    if (req.user.role !== 'admin')
        query.select('-hiddenTestCase -referenceSolution -problemCreator');

    const problem = await query;
    if (!problem)
        throw new AppError(404, "Problem Not Found");

    res.status(200).send(problem);
}

const getAllProblem = async (req, res) => {

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

const solvedProblemsbyUser = async (req, res) => {

    await req.user.populate({
        path: "problemSolved",
        select: "_id title tags difficulty"
    });

    res.status(200).send(req.user.problemSolved);
}


module.exports = { createProblem, updateProblem, deleteProblem, getProblemById, getAllProblem, solvedProblemsbyUser };
