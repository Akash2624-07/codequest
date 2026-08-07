const mongoose = require("mongoose");


async function Main(){
    // No try/catch: it only replaced the error with a message-only copy,
    // discarding the stack and mongoose's own error code. startServer() in
    // src/index.js already catches this and exits.
    await mongoose.connect(process.env.DB_CONNECT_URI);
}

module.exports = Main;