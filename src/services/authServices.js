const crypto = require('crypto');
const redisClient = require('../config/redis');

async function generateToken(userId){

    const token = crypto.randomBytes(32).toString('hex');
    await Promise.all([
        redisClient.set(`verify:token:${token}`, userId.toString(), {EX:600}),
        redisClient.set(`verify:user:${userId.toString()}`, token, {EX:600})
    ]);

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

    const token = await redisClient.get(`verify:user:${userId.toString()}`);

    await Promise.all([
        redisClient.del(`verify:token:${token}`),
        redisClient.del(`verify:user:${userId.toString()}`)
    ]);

}

module.exports = {generateToken, verifyToken, deleteToken}
