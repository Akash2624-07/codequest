const express = require('express');
const { register, login, logout, adminRegister, deleteProfile, getProfile } = require('../controller/userController');
const userMiddleware = require('../middleware/userMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const authRouter = express.Router();

// Register
authRouter.post("/register", register);

// Login
authRouter.post("/login", login);

// Logout
authRouter.post("/logout", userMiddleware, logout);

// Delete Profile
authRouter.delete("/profile", userMiddleware, deleteProfile);

// Admin register
authRouter.post("/admin/register", adminMiddleware, adminRegister);

// Authentication or Get Profile
authRouter.get("/me", userMiddleware, getProfile);

module.exports = authRouter;

