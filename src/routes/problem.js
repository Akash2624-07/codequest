const express = require('express');
const problemRouter = express.Router();

const adminMiddleware = require('../middleware/adminMiddleware');
const userMiddleware = require('../middleware/userMiddleware');
const { createProblem, updateProblem, deleteProblem, getProblemById, getAllProblem } = require('../controller/problemController');



problemRouter.post("/", adminMiddleware, createProblem);

problemRouter.get("/", userMiddleware, getAllProblem);

// problemRouter.get("/solved/me", userMiddleware, solvedAllProblembyUser);

problemRouter.get("/:id", userMiddleware, getProblemById);

problemRouter.put("/:id", adminMiddleware, updateProblem);

problemRouter.delete("/:id", adminMiddleware, deleteProblem);



module.exports = problemRouter;
