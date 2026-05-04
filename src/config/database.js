const mongoose = require("mongoose");


async function Main(){
    try{
        await mongoose.connect(process.env.DB_CONNECT_URI);
        console.log("Connected to DB successfully.");
    }
    catch(err){
        throw new Error(err.message);
    }
}

module.exports = Main;