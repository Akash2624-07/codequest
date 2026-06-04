const Problem = require('../models/problem');
const { getLanguageId, submitBatch, getSubmissionResults } = require('../utils/judge0');

const createProblem = async (req, res) => {
    // Admin is verified : True

    const { title, description, difficulty, tags, visibleTestCase, hiddenTestCase, startCode, referenceSolution, problemCreator } = req.body;



    // Check if the reference soln is correct
    try {

        const totalTestCases = [...visibleTestCase, ...hiddenTestCase];
        // referenceSolution : [{}, {}, {}];
        for (const { language, completeCode } of referenceSolution) {
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
            if (failedCase) {
                return res.status(400).send(`Reference solution for ${language} failed: ${failedCase.status.description}`);
            }
        };

        // All solutions validated, safe to save
        const problem = await Problem.create(req.body);

        res.status(201).json({ message: "Problem created successfully", problem });

    }
    catch (err) {
        res.status(500).send("Error: " + err.message);
    }

};

module.exports = { createProblem };