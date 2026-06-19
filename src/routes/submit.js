const express = require('express');
const submitRouter = express.Router();

const userMiddleware = require('../middleware/userMiddleware');
const submitCode = require('../controller/submissionController');

submitRouter.post('/:id/submit', userMiddleware, submitCode);
// submitRouter.patch('/:id/run', userMiddleware, runCode);

module.exports = submitRouter;