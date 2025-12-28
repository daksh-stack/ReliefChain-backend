const { createClient } = require('redis');

let redisClient = null;
let connectionFailed = false;

const connectRedis = async () => {
    // If we already know connection failed, don't retry
    if (connectionFailed) {
        console.log('Redis: Skipping connection (previously failed)');
        return null;
    }

    try {
        const redisURL = process.env.REDIS_URL || 'redis://localhost:6379';

        redisClient = createClient({
            url: redisURL,
            socket: {
                connectTimeout: 5000,
                reconnectStrategy: (retries) => {
                    // Stop retrying after 3 attempts
                    if (retries > 2) {
                        connectionFailed = true;
                        console.log('Redis: Max retries reached, running without Redis');
                        return false; // Stop retrying
                    }
                    return Math.min(retries * 500, 2000);
                }
            }
        });

        redisClient.on('error', (err) => {
            // Only log once to avoid spam
            if (!connectionFailed) {
                console.log('Redis: Connection error, will use in-memory queue');
                connectionFailed = true;
            }
        });

        redisClient.on('connect', () => {
            console.log('Redis Client Connected');
        });

        redisClient.on('ready', () => {
            console.log('Redis Client Ready');
            connectionFailed = false;
        });

        await redisClient.connect();

        return redisClient;
    } catch (error) {
        connectionFailed = true;
        console.log('Redis: Connection failed, using in-memory queue instead');
        redisClient = null;
        return null;
    }
};

const getRedisClient = () => {
    if (connectionFailed) return null;
    return redisClient;
};

const disconnectRedis = async () => {
    if (redisClient) {
        try {
            await redisClient.quit();
        } catch (error) {
            // Ignore disconnect errors
        }
        redisClient = null;
    }
};

const isRedisConnected = () => {
    return redisClient && redisClient.isOpen && !connectionFailed;
};

module.exports = {
    connectRedis,
    getRedisClient,
    disconnectRedis,
    isRedisConnected
};
