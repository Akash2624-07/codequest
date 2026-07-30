const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const redisClient = require('../config/redis');
const sendVerificationEmail = require('../utils/mailer');
const { generateToken, verifyToken, deleteToken } = require('../services/authServices');
const AppError = require('../utils/AppError');

const register = async (req, res) => {

    // req.body is validated + whitelisted by validate(registerSchema).
    const { firstName, lastName, emailId, password, age } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    // Fields taken individually (not spread) so role/isVerified can never be
    // set by the client. A duplicate emailId surfaces as a Mongoose 11000
    // error → central handler → 409.
    const user = await User.create({ firstName, lastName, emailId, age, password: hashedPassword, role: "user" });

    // Generate verification token and send mail. If the mail fails, roll the
    // user back so they can retry a clean registration.
    try {
        const token = await generateToken(user._id);
        await sendVerificationEmail(user.emailId, token);
    }
    catch (err) {
        await User.findByIdAndDelete(user._id);
        throw new AppError(500, "Failed to send verification email. Please try again.");
    }

    return res.status(201).json({
        message: "Verification link successfully sent",
        userInfo: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            emailId: user.emailId,
            role: user.role,
        }
    })
}

const login = async (req, res) => {

    // emailId is guaranteed to be a string by validate(loginSchema) — this is
    // what closes the NoSQL-operator injection on this endpoint.
    const { emailId, password } = req.body;

    const user = await User.findOne({ emailId });
    if (!user) {
        throw new AppError(401, "Invalid Credentials");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new AppError(401, "Invalid Credentials");
    }

    if (!user.isVerified) {
        throw new AppError(403, "You are not verified yet. Please click the link below to receive a verification link.");
    }

    const token = jwt.sign({ _id: user._id, emailId: user.emailId, role: user.role }, process.env.JWT_SECRET_KEY, { expiresIn: 60 * 60 });

    res.cookie('token', token, { maxAge: 60 * 60 * 1000, httpOnly: true });
    return res.status(200).json({
        message: "User login successful",
        userInfo: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            emailId: user.emailId,
            role: user.role,
        }
    })
}

const logout = async (req, res) => {

    const { token } = req.cookies;
    const payload = jwt.decode(token);

    // Add token to the Redis blocklist with its TTL set in the same round trip
    // (EXAT expects a Unix-seconds timestamp, same as the JWT's exp claim).
    await redisClient.set(`token:${token}`, `Blocked`, { EXAT: payload.exp });

    res.clearCookie("token");
    res.status(200).send("User logged out successfully");
}

const adminRegister = async (req, res) => {

    // req.body is validated + whitelisted, so spreading it can't inject role
    // or isVerified — role is forced to "admin" below regardless.
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    // No token/cookie issued here — this account is created by an already
    // logged-in admin, so we must not touch their session cookie.
    const user = await User.create({ ...req.body, password: hashedPassword, role: "admin" });

    res.status(201).json({
        message: "Admin created successfully",
        user: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            emailId: user.emailId,
            role: user.role,
            createdAt: user.createdAt,
        },
    });
}

const deleteProfile = async (req, res) => {

    const userId = req.user._id;
    const { token } = req.cookies;
    const payload = jwt.decode(token);

    // Deleting the user and blocklisting their token are independent writes to
    // two different stores — run them concurrently.
    await Promise.all([
        User.findByIdAndDelete(userId),
        redisClient.set(`token:${token}`, `Blocked`, { EXAT: payload.exp })
    ]);

    res.clearCookie("token");
    res.status(200).send("Profile Deleted Successfully");
}

const getProfile = (req, res) => {

    const { _id, firstName, lastName, emailId, role } = req.user;

    const userInfo = {
        _id,
        firstName,
        lastName,
        emailId,
        role,
    }

    return res.status(200).json({
        message: "User validated",
        userInfo,
    })
}

const getAllUsers = async (req, res) => {

    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 20, 50));
    const cursor = req.query.cursor;

    const query = cursor
        ? { _id: { $gt: cursor } }
        : {};

    const users = await User.find(query)
        .limit(limit)
        .sort({ _id: 1 })
        .select('_id firstName lastName emailId role createdAt');

    const nextCursor = users.length === limit
        ? users[users.length - 1]._id
        : null;

    res.status(200).json({
        users,
        nextCursor,
        hasMore: nextCursor !== null
    });
}

const updateUserRole = async (req, res) => {

    const { id } = req.params;
    const { role } = req.body; // validated to 'user' | 'admin'

    if (id === req.user._id.toString())
        throw new AppError(400, "You cannot change your own role");

    const user = await User.findByIdAndUpdate(
        id,
        { role },
        { runValidators: true, new: true }
    ).select('_id firstName lastName emailId role createdAt');

    if (!user)
        throw new AppError(404, "User not found");

    res.status(200).json({ message: "Role updated successfully", user });
}

const deleteUser = async (req, res) => {

    const { id } = req.params;

    if (id === req.user._id.toString())
        throw new AppError(400, "You cannot delete your own account from here");

    const user = await User.findByIdAndDelete(id);

    if (!user)
        throw new AppError(404, "User not found");

    res.status(200).json({ message: "User deleted successfully" });
}

const verifyUser = async (req, res) => {

    const { token } = req.query;
    const userId = await verifyToken(token);

    if (!userId)
        throw new AppError(400, "Invalid or expired token");

    await User.findByIdAndUpdate(userId, { isVerified: true });
    await deleteToken(userId);

    res.status(200).json({ message: "User verified successfully" });
}

const resendVerificationEmail = async (req, res) => {

    const { emailId } = req.body;

    // Find User
    const user = await User.findOne({ emailId });

    if (!user) {
        throw new AppError(404, "No account found with this email");
    }

    if (user.isVerified) {
        throw new AppError(400, "This account is already verified. Please login.");
    }

    // Remove any pre-existing verification token, then issue a fresh one.
    await deleteToken(user._id);

    const token = await generateToken(user._id);
    await sendVerificationEmail(emailId, token);

    res.status(200).json({ message: "Verification link has been sent again" });
}

module.exports = { register, login, logout, adminRegister, deleteProfile, getProfile, getAllUsers, updateUserRole, deleteUser, verifyUser, resendVerificationEmail };
