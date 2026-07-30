const express = require('express');
const { register, login, logout, adminRegister, deleteProfile, getProfile, getAllUsers, updateUserRole, deleteUser, verifyUser, resendVerificationEmail } = require('../controller/userController');
const userMiddleware = require('../middleware/userMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema, resendVerificationSchema, updateRoleSchema } = require('../schemas/authSchemas');

const authRouter = express.Router();

// Register
authRouter.post("/register", validate(registerSchema), register);

// Login
authRouter.post("/login", validate(loginSchema), login);

// Logout
authRouter.post("/logout", userMiddleware, logout);

// Delete Profile
authRouter.delete("/profile", userMiddleware, deleteProfile);

// Admin register
authRouter.post("/admin/register", adminMiddleware, validate(registerSchema), adminRegister);

// Admin: list all users
authRouter.get("/admin/users", adminMiddleware, getAllUsers);

// Admin: update a user's role
authRouter.patch("/admin/users/:id/role", adminMiddleware, validate(updateRoleSchema), updateUserRole);

// Admin: delete a user
authRouter.delete("/admin/users/:id", adminMiddleware, deleteUser);

// Authentication or Get Profile
authRouter.get("/me", userMiddleware, getProfile);

// Verify email of an user
authRouter.get("/verify", verifyUser);

// Resend verification email
authRouter.post("/resend-verification", validate(resendVerificationSchema), resendVerificationEmail);

module.exports = authRouter;

