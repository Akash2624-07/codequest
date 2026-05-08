const User = require('../models/users');
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
        res.status(201).send("User Created Successfully");
    }
    catch (err) {
        res.status(400).send("Error: " + err.message);
    }

}

const login = async (req, res) => {
    try {

        const { emailId, password } = req.body;

        if (!emailId)
            throw new Error("Invalid Credentials");
        if (!password)
            throw new Error("Invalid Credentials");

        const user = await User.findOne({ emailId });

        if (!user)
            throw new Error("Invalid Credentials");

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            throw new Error("Invalid Credentials");

        const token = jwt.sign({ _id: user._id, emailId: user.emailId, role: user.role }, process.env.JWT_SECRET_KEY, { expiresIn: 60 * 60 });

        res.cookie('token', token, { maxAge: 60 * 60 * 1000, httpOnly: true });
        res.status(200).send("Logged in Successfully");
    }
    catch (err) {
        res.status(401).send("Error: " + err.message);
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
        res.status(500).send("Error: " + err);
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
        res.status(201).send("Admin Created Successfully");
    }
    catch (err) {
        res.status(400).send("Error: " + err.message);
    }
}

module.exports = { register, login, logout, adminRegister };