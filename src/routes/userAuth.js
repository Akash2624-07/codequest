const express = require('express');
const {register, login, logout} = require('../controller/userController');
const authRouter = express.Router();

// Register
authRouter.post("/register", register);

// Login
authRouter.post("/login", login);

// Logout
authRouter.post("/logout", logout);

module.exports = authRouter;

