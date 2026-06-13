const mongoose = require('mongoose');
const { Schema } = mongoose;

const submissionSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    problemId: {
        type: Schema.Types.ObjectId,
        ref: 'problems',
        required: true
    },
    code: {
        type: String,
        required: true
    },
    language: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'wrong', 'error'],
        default: 'pending'
    },
    runTime: {
        type: Number,
        default: null
    },
    memory: {
        type: Number,
        default: null
    },
    testCasesPassed: {
        type: Number,
        default: 0
    },
    totalTestCases: {
        type: Number,
        default: 0
    },
    failedCase: {
        input:{
            type:String,
            default:null
        },
        expectedOutput:{
            type:String,
            default:null
        },
        actualOutput:{
            type:String,
            default:null
        },
        stderr:{
            type:String,
            default:null
        }
    }
}, {
    timestamps: true
});

const Submission = mongoose.model("submissions", submissionSchema);

module.exports = Submission;