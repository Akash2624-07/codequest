const crypto = require('crypto');
const redisClient = require('../config/redis');

async function generateToken(userId){

    const token = crypto.randomBytes(32).toString('hex');
    await redisClient.set(`verify:token:${token}`,userId, {EX:600});
    await redisClient.set(`verify:user:${userId}`,token, {EX:600});

    return token;

}

async function verifyToken(token){

    const userId = await redisClient.get(`verify:token:${token}`);

    if(!userId){
        throw new Error("Invalid or expired token");
    }
    // userId is already a string

    return userId;

}

async function deleteToken(userId){

    const token = await redisClient.get(`verify:user:${userId}`);

    await redisClient.del(`verify:token:${token}`);
    await redisClient.del(`verify:user:${userId}`);

}

module.exports = {generateToken, verifyToken, deleteToken}
