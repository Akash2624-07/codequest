const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    firstName: {
        type: String,
        minLength: 2,
        maxLength: 20,
        required: true
    },
    lastName: {
        type: String,
        minLength: 2,
        maxLength: 20,
    },
    emailId: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        immutable: true
    },
    isVerified:{
        type:Boolean,
        default:false,
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
    problemSolved: [
        {
            type: Schema.Types.ObjectId,
            ref: 'problems'
        }
    ],

    password: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

userSchema.post('findOneAndDelete', async function (userInfo) {
    if (userInfo) {
      await mongoose.model('submissions').deleteMany({ userId: userInfo._id });
    }
});

const User = mongoose.model("users", userSchema);
module.exports = User;