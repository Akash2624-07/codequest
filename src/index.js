const express = require('express');
const cookieParser = require('cookie-parser')
require('dotenv').config();
const Main = require('./config/database');





const app = express();
app.use(express.json());
app.use(cookieParser());


async function startServer() {

    try {
        await Main();

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