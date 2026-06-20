const express = require('express');
const submitRouter = express.Router();

const userMiddleware = require('../middleware/userMiddleware');
const {submitCode, runCode} = require('../controller/submissionController');

submitRouter.post('/:id/submit', userMiddleware, submitCode);
submitRouter.post('/:id/run', userMiddleware, runCode);

module.exports = submitRouter;