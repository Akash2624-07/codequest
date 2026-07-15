const express = require('express');
const submitRouter = express.Router();

const userMiddleware = require('../middleware/userMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { submitCode, runCode , getSubmissions, getAllSubmissions, getSubmissionsForUser } = require('../controller/submissionController');


submitRouter.get("/submissions/me", userMiddleware, getAllSubmissions); //Practice History

// Admin: view a specific user's full submission history
submitRouter.get("/submissions/admin/:userId", adminMiddleware, getSubmissionsForUser);

submitRouter.post('/:id/submit', userMiddleware, submitCode);

submitRouter.post('/:id/run', userMiddleware, runCode);

submitRouter.get("/:id/submissions", userMiddleware, getSubmissions);

module.exports = submitRouter;