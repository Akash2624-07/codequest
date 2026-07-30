const jwt = require('jsonwebtoken');
const Users = require('../models/user');
const redisClient = require('../config/redis');
const AppError = require('../utils/AppError');


const adminMiddleware = async (req, res, next) => {

    // Take out token
    const { token } = req.cookies;

    // if token doesnt exist -
    if (!token)
        throw new AppError(403, "Invalid token");

    // jwt.verify throws on a malformed, expired or tampered token. That's a
    // client problem, so translate it here — left to bubble, the central
    // handler wouldn't recognise the error type and would report it as a 500.
    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
    }
    catch {
        throw new AppError(403, "Invalid token");
    }

    const { _id } = payload;

    // Check for admin role, before hitting the DB
    if (payload.role != 'admin')
        throw new AppError(403, "Invalid token");

    // Redis blocklist check and the user lookup don't depend on each
    // other, so run them concurrently instead of round-tripping twice.
    const [isBlocked, user] = await Promise.all([
        redisClient.exists(`token:${token}`),
        Users.findById(_id)
    ]);

    // if it does, throw an error
    if (isBlocked)
        throw new AppError(403, "Invalid token");

    // If no such user exist
    if (!user)
        throw new AppError(403, "User does not exist");


    req.user = user;
    next();

}

module.exports = adminMiddleware;
