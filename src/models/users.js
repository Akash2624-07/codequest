const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    firstName: {
        type: String,
        minLength: 2,
        maxLength: 20,
        require: true
    },
    lastName: {
        type: String,
        minLength: 2,
        maxLength: 20,
    },
    emailId: {
        type: String,
        require: true,
        unique: true,
        lowercase: true,
        immutable: true
    },
    age: {
        type: Number,
        min: 6,
        max: 100,
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    problemSolved: {
        type: [String]
    },
    password: {
        type: String,
        required: true
    }
});


const User = mongoose.model("users", userSchema);
module.exports = User;