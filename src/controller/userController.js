const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validate = require('../utils/validator');
const redisClient = require('../config/redis');

const register = async (req, res) => {

    try {
        // Validate the data
        validate(req.body);

        const { password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create User data
        const user = await User.create({ ...req.body, password: hashedPassword, role: "user" });

        // Generate JWT token
        const token = jwt.sign({ _id: user._id, emailId: user.emailId, role: user.role }, process.env.JWT_SECRET_KEY, { expiresIn: 60 * 60 });

        res.cookie('token', token, { maxAge: 60 * 60 * 1000, httpOnly: true });

        return res.status(201).json({
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

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid Credentials" });
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

        // Add token to RedisDB
        await redisClient.set(`token:${token}`, `Blocked`);
        // Set TTL
        await redisClient.expireAt(`token:${token}`, payload.exp)

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
        const user = await User.create({ ...req.body, password: hashedPassword, role: "admin" });

        // Generate JWT token
        const token = jwt.sign({ _id: user._id, emailId: user.emailId, role: user.role }, process.env.JWT_SECRET_KEY, { expiresIn: 60 * 60 });

        res.cookie('token', token, { maxAge: 60 * 60 * 1000, httpOnly: true });
        res.status(201).json({ message: "Admin Created Successfully" });
    }
    catch (err) {
        res.status(400).json({ message: err.message });
    }
}

const deleteProfile = async (req, res) => {

    try {
        const userId = req.result._id;
        const { token } = req.cookies;

        const payload = jwt.decode(token, process.env.JWT_SECRET_KEY);

        await User.findByIdAndDelete(userId);

        // Add token to RedisDB
        await redisClient.set(`token:${token}`, `Blocked`);
        // Set TTL
        await redisClient.expireAt(`token:${token}`, payload.exp);

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

module.exports = { register, login, logout, adminRegister, deleteProfile, getProfile };