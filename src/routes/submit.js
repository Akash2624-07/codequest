const express = require('express');
const submitRouter = express.Router();

const userMiddleware = require('../middleware/userMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const validate = require('../middleware/validate');
const { submitSchema } = require('../schemas/submissionSchemas');
const { submitCode, runCode , getSubmissions, getAllSubmissions, getSubmissionsForUser } = require('../controller/submissionController');


submitRouter.get("/submissions/me", userMiddleware, getAllSubmissions); //Practice History

// Admin: view a specific user's full submission history
submitRouter.get("/submissions/admin/:userId", adminMiddleware, getSubmissionsForUser);

submitRouter.post('/:id/submit', userMiddleware, validate(submitSchema), submitCode);

submitRouter.post('/:id/run', userMiddleware, validate(submitSchema), runCode);

submitRouter.get("/:id/submissions", userMiddleware, getSubmissions);

module.exports = submitRouter;