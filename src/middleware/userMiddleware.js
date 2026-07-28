const jwt = require('jsonwebtoken');
const Users = require('../models/user');
const redisClient = require('../config/redis');


const userMiddleware = async (req, res, next) => {

    try {
        // Take out token
        const { token } = req.cookies;

        // if token doesnt exist - 
        if (!token)
            throw new Error("Invalid token");

        // Take out payload & _id 
        const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
        const { _id } = payload;

        // If _id doesnt exist
        // if(!_id)  --> redundant, if id doesnt exist then jwt.verify will throw error
        //     throw new Error("Invalid token");

        // Redis blocklist check and the user lookup don't depend on each
        // other, so run them concurrently instead of round-tripping twice.
        const [isBlocked, user] = await Promise.all([
            redisClient.exists(`token:${token}`),
            Users.findById(_id)
        ]);

        // if it does, throw an error
        if (isBlocked)
            throw new Error("Invalid token");

        // If no such user exist
        if (!user)
            throw new Error("User doesnt exist");

        req.result = user;
        next();

    }
    catch (err) {
        res.status(401).send("Error: " + err.message)
    }

}

module.exports = userMiddleware;