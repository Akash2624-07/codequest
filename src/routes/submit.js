const express = require('express');
const submitRouter = express.Router();

const userMiddleware = require('../middleware/userMiddleware');
const { submitCode, runCode , getSubmissions, getAllSubmissions } = require('../controller/submissionController');


submitRouter.get("/submissions/me", userMiddleware, getAllSubmissions); //Practice History

submitRouter.post('/:id/submit', userMiddleware, submitCode);

submitRouter.post('/:id/run', userMiddleware, runCode);

submitRouter.get("/:id/submissions", userMiddleware, getSubmissions);

module.exports = submitRouter;