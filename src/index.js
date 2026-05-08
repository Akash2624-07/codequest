const express = require('express');
const cookieParser = require('cookie-parser')
require('dotenv').config();
const Main = require('./config/database');
const authRouter = require('./routes/userAuth');
const redisClient = require('./config/redis');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use("/user",authRouter);



async function startServer() {

    try {
        // Try to connect to both Databases at once
        await Promise.all([Main(),redisClient.connect()]);
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