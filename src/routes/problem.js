const express = require('express');
const problemRouter = express.Router();
const adminMiddleware = require('../middleware/adminMiddleware');
const { createProblem } = require('../controller/problemController');




// Admin access only
problemRouter.post("/create", adminMiddleware, createProblem);
// problemRouter.patch("/:id", updateProblem);
// problemRouter.delete("/:id", deleteProblem);


// User access
// problemRouter.get("/user", userSolvedProblem);
// problemRouter.get("/:id", getProblemById);
// problemRouter.get("/", getAllProblem);

module.exports = {problemRouter};
