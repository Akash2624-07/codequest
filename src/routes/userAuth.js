const express = require('express');
const {register, login, logout, adminRegister} = require('../controller/userController');
const userMiddleware = require('../middleware/userMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const authRouter = express.Router();

// Register
authRouter.post("/register", register);

// Login
authRouter.post("/login", login);

// Logout
authRouter.post("/logout", userMiddleware, logout);

// Admin register
authRouter.post("/admin/register", adminMiddleware, adminRegister);

module.exports = authRouter;

