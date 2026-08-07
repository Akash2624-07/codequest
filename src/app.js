const express = require('express');
const cookieParser = require('cookie-parser')
const cors = require('cors');


const authRouter = require('./routes/userAuth');
const problemRouter = require('./routes/problem');
const submitRouter = require('./routes/submit');
const errorHandler = require('./middleware/errorHandler');

const app = express();
    
app.use(cors({
    // Falls back rather than passing undefined: with credentials:true, an
    // undefined origin makes cors reflect whatever Origin the request carries,
    // which allows every site instead of none.
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/user", authRouter);
app.use("/problems", problemRouter);
app.use("/problems", submitRouter);

// Central error handler — must be registered last, after all routes, so
// errors thrown/rejected in any handler above land here.
app.use(errorHandler);


module.exports = app;