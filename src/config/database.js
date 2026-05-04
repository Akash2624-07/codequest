const mongoose = require("mongoose");


async function Main(){
    try{
        await mongoose.connect(process.env.DB_CONNECT_URI);
        console.log("Connected to DB successfully.");
    }
    catch(err){
        console.log("Error occured: "+err.message)
    }
}

module.exports = Main;