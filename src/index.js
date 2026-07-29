const express = require('express');
const cookieParser = require('cookie-parser')
const cors = require('cors');
require('dotenv').config();
const Main = require('./config/database');
const redisClient = require('./config/redis');
const authRouter = require('./routes/userAuth');
const problemRouter = require('./routes/problem');
const submitRouter = require('./routes/submit');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({
    origin: 'http://localhost:5173',
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



async function startServer() {

    try {
        // Try to connect to both Databases at once
        await Promise.all([Main(), redisClient.connect()]);
        console.log("Connected to DB successfully.");

        app.listen(process.env.PORT || 3000, () => {
            console.log("Server running on " + process.env.PORT);
        });
    }
    catch (err) {
        console.log("Error: " + err);
        process.exit(1);
    }

}
startServer();