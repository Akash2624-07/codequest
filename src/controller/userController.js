const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validate = require('../utils/validator');
const redisClient = require('../config/redis');
const sendVerificationEmail = require('../utils/mailer');
const { generateToken, verifyToken, deleteToken } = require('../services/authServices');

const register = async (req, res) => {

    try {
        // Validate the data
        validate(req.body);

        const { firstName, lastName, emailId, password, age } = req.body;
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create User data
        // NOTE: fields taken individually, not spread from req.body — isVerified
        // and role must never be settable by the client here.
        const user = await User.create({ firstName, lastName, emailId, age, password: hashedPassword, role: "user" });

        // Generate Verification Token and send mail
        try{
            const token = await generateToken(user._id);
            await sendVerificationEmail(user.emailId, token);
        }
        catch(err){
            await User.findByIdAndDelete(user._id);
            return res.status(500).json({ message: "Failed to send verification email. Please try again." });
        }

        return res.status(201).json({
            message: "Verification link succesfully sent",
            userInfo: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                emailId: user.emailId,
                role: user.role,
            }
        })
    }
    catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: "An account with this email already exists" });
        }
        res.status(400).json({ message: err.message })
    }

}

const login = async (req, res) => {
    try {

        const { emailId, password } = req.body;

        if (!emailId || !password) {
            return res.status(400).json({ message: "Invalid Credentials" });
        }

        const user = await User.findOne({ emailId });

        if (!user) {
            return res.status(401).json({ message: "Invalid Credentials" });
        }

        const isMatch = await bcrypt.compare(password, user?.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid Credentials" });
        }
        
        if(!user?.isVerified){
            return res.status(403).json({message:"You are not verified yet. Please click the link below to receive a verification link."});
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
    catch (err) {
        res.status(500).json({ message: err.message });
    }
}

const logout = async (req, res) => {

    try {
        const { token } = req.cookies;
        const payload = jwt.decode(token, process.env.JWT_SECRET_KEY);

        // Add token to RedisDB with its TTL set in the same round trip
        // (EXAT expects a Unix-seconds timestamp, same as the JWT's exp claim).
        await redisClient.set(`token:${token}`, `Blocked`, { EXAT: payload.exp });

        // Clear cookies
        // res.cookie("token", null, {expires: new Date(Date.now())});
        res.clearCookie("token");
        res.status(200).send("User logged out successfully");

    }
    catch (err) {
        res.status(400).json({ message: err.message })
    }
}

const adminRegister = async (req, res) => {
    try {
        // Validate the data
        validate(req.body);

        const { password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create Admin data
        // NOTE: no token/cookie issued here — this account is created by an
        // already-logged-in admin, so we must not touch their session cookie.
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
    catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: "An account with this email already exists" });
        }
        res.status(400).json({ message: err.message });
    }
}

const deleteProfile = async (req, res) => {

    try {
        const userId = req.result._id;
        const { token } = req.cookies;

        const payload = jwt.decode(token, process.env.JWT_SECRET_KEY);

        // Deleting the user and blocklisting their token are independent
        // writes to two different stores — run them concurrently.
        await Promise.all([
            User.findByIdAndDelete(userId),
            redisClient.set(`token:${token}`, `Blocked`, { EXAT: payload.exp })
        ]);

        // Clear cookies
        res.clearCookie("token");


        res.status(200).send("Profile Deleted Successfully");
    }
    catch (err) {
        res.status(500).send("Error: " + err.message);
    }

}

const getProfile = (req, res) => {

    const { _id, firstName, lastName, emailId, role } = req.result;

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

    try {
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
    catch (err) {
        res.status(500).json({ message: err.message });
    }
}

const updateUserRole = async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    try {
        if (!['user', 'admin'].includes(role))
            return res.status(400).json({ message: "Role must be 'user' or 'admin'" });

        if (id === req.result._id.toString())
            return res.status(400).json({ message: "You cannot change your own role" });

        const user = await User.findByIdAndUpdate(
            id,
            { role },
            { runValidators: true, new: true }
        ).select('_id firstName lastName emailId role createdAt');

        if (!user)
            return res.status(404).json({ message: "User not found" });

        res.status(200).json({ message: "Role updated successfully", user });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
}

const deleteUser = async (req, res) => {
    const { id } = req.params;

    try {
        if (id === req.result._id.toString())
            return res.status(400).json({ message: "You cannot delete your own account from here" });

        const user = await User.findByIdAndDelete(id);

        if (!user)
            return res.status(404).json({ message: "User not found" });

        res.status(200).json({ message: "User deleted successfully" });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
}

const verifyUser = async (req, res) => {

    try{
        const token = req.query.token;
        const userId = await verifyToken(token);

        const user = await User.findByIdAndUpdate(userId,{isVerified:true});
        await deleteToken(userId);

        res.status(200).json({ message : "User Verified Succesfully" });
    }
    catch(err){
        res.status(400).json({ message: err.message })
    }
}

const resendVerificationEmail = async (req, res) => {

    try{
        
        const { emailId } = req.body;
        if (!emailId) {
            return res.status(400).json({ message: "Enter your e-mail and try again!" });
        }
        // Find User
        const user = await User.findOne({ emailId });
        
        if(!user){
            return res.status(404).json({message:"No account found with this email"});
        }

        if(user.isVerified){
            return res.status(400).json({message:"This account is already verified. Please login."});
        }

        // Remove any pre-existing verification token
        await deleteToken(user._id);

        // Generate another verification token and send mail
        const token = await generateToken(user._id);
        await sendVerificationEmail(emailId, token);

        res.status(200).json({message:"Verification link has been sent again"});

    }catch(err){
        res.status(400).json({ message: err.message })
    }
}

module.exports = { register, login, logout, adminRegister, deleteProfile, getProfile, getAllUsers, updateUserRole, deleteUser, verifyUser, resendVerificationEmail };