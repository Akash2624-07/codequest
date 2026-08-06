// Must run before the requires below: config/redis.js reads process.env at
// module scope, so a later dotenv leaves it holding undefined forever.
require('dotenv').config();

const app = require('./app');
const Main = require('./config/database');
const redisClient = require('./config/redis');

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