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
            throw new Error("Missing ID");

        const problem = await Problem.findById(id);

        if(!problem)
            throw new Error("Problem does not exists");

        if (!visibleTestCase?.length)
            throw new Error("Visible test cases cannot be empty");

        if (!hiddenTestCase?.length)
            throw new Error("Hidden test cases cannot be empty");

        const totalTestCases = [...visibleTestCase, ...hiddenTestCase];

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

            const failedCase = results.find(r => r.status.id !== 3);
            if (failedCase) {
                return res.status(400).send(`Reference solution for ${language} failed: ${failedCase.status.description}`);
            }
        };

        // All solutions validated, safe to save
        const newProblem = await Problem.findByIdAndUpdate(id, { ...req.body, problemCreator: req.result._id },{runValidators:true, new:true});

        res.status(200).json({ message: "Problem updated successfully", newProblem });
    }
    catch (err) {
        res.send("Error: " + err.message);
    }

}

module.exports = { createProblem, updateProblem };