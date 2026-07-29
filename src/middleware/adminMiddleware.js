const jwt = require('jsonwebtoken');
const Users = require('../models/user');
const redisClient = require('../config/redis');


const adminMiddleware = async (req, res, next) => {

    try {
        // Take out token
        const { token } = req.cookies;

        // if token doesnt exist - 
        if (!token)
            throw new Error("Invalid token");

        // Take out payload & _id 
        const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
        const { _id } = payload;

        // Check for admin role, before hitting the DB 
        if(payload.role!='admin')
            throw new Error("Invalid Token");

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


        req.user = user;
        next();

    }
    catch (err) {
        res.status(403).send("Error: " + err.message)
    }

}

module.exports = adminMiddleware;