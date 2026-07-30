const express = require('express');
const problemRouter = express.Router();

const adminMiddleware = require('../middleware/adminMiddleware');
const userMiddleware = require('../middleware/userMiddleware');
const validate = require('../middleware/validate');
const { problemSchema } = require('../schemas/problemSchemas');
const { createProblem, updateProblem, deleteProblem, getProblemById, getAllProblem, solvedProblemsbyUser } = require('../controller/problemController');



problemRouter.post("/", adminMiddleware, validate(problemSchema), createProblem);

problemRouter.get("/", userMiddleware, getAllProblem);

problemRouter.get("/solved/me", userMiddleware, solvedProblemsbyUser);

problemRouter.get("/:id", userMiddleware, getProblemById);

problemRouter.put("/:id", adminMiddleware, validate(problemSchema), updateProblem);

problemRouter.delete("/:id", adminMiddleware, deleteProblem);



module.exports = problemRouter;
