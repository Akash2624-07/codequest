const express = require('express');
const problemRouter = express.Router();
const adminMiddleware = require('../middleware/adminMiddleware');
const { createProblem, updateProblem } = require('../controller/problemController');




// Admin access only
problemRouter.post("/create", adminMiddleware, createProblem);
problemRouter.put("/update/:id", adminMiddleware, updateProblem);
// problemRouter.delete("/:id", deleteProblem);


// User access
// problemRouter.get("/user", userSolvedProblem);
// problemRouter.get("/:id", getProblemById);
// problemRouter.get("/", getAllProblem);

module.exports = problemRouter;
