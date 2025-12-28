require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Config imports
const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');

// Route imports
const authRoutes = require('./routes/auth.routes');
const requestRoutes = require('./routes/request.routes');
const { setSocketIO } = require('./routes/request.routes');

// Service imports
const { getPriorityQueue } = require('./services/priorityQueue.service');
const ReliefRequest = require('./models/ReliefRequest');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

// Set Socket.io in request routes
setSocketIO(io);

// Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/request', requestRoutes);
app.use('/api', requestRoutes); // Also mount at /api for /api/queue, /api/dequeue, etc.

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Disaster Relief API is running',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Disaster Relief Distribution Tracker API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            requests: '/api/request',
            queue: '/api/queue',
            health: '/health'
        }
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Send current queue state on connection
    const queue = getPriorityQueue();
    socket.emit('queueState', {
        queue: queue.getAll(),
        size: queue.size()
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });

    // Handle request for queue update
    socket.on('requestQueueUpdate', () => {
        const currentQueue = getPriorityQueue();
        socket.emit('queueState', {
            queue: currentQueue.getAll(),
            size: currentQueue.size()
        });
    });

    // Handle subscription to specific request updates
    socket.on('subscribeToRequest', (requestId) => {
        socket.join(`request:${requestId}`);
    });

    socket.on('unsubscribeFromRequest', (requestId) => {
        socket.leave(`request:${requestId}`);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Initialize database and start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();
        console.log('MongoDB connected successfully');

        // Connect to Redis (optional - app works without it)
        const redis = await connectRedis();
        if (redis) {
            console.log('Redis connected successfully');
        } else {
            console.log('Running without Redis (using in-memory queue)');
        }

        // Load existing pending requests into priority queue
        const queue = getPriorityQueue();
        const pendingRequests = await ReliefRequest.find({ status: 'PENDING' }).lean();

        if (pendingRequests.length > 0) {
            queue.loadFromArray(pendingRequests);
            console.log(`Loaded ${pendingRequests.length} pending requests into priority queue`);
        }

        // Start periodic priority recalculation (every 5 minutes)
        setInterval(() => {
            const currentQueue = getPriorityQueue();
            currentQueue.recalculateAllPriorities();

            // Broadcast updated queue
            io.emit('queueUpdated', {
                queue: currentQueue.getAll(),
                size: currentQueue.size()
            });

            console.log('Priority scores recalculated');
        }, 5 * 60 * 1000);

        // Start server
        server.listen(PORT, () => {
            console.log(`\n🚀 Server running on port ${PORT}`);
            console.log(`📡 API: http://localhost:${PORT}`);
            console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
            console.log(`\n📋 Available endpoints:`);
            console.log(`   POST /api/auth/register - Register new user`);
            console.log(`   POST /api/auth/login - Login`);
            console.log(`   GET  /api/auth/me - Get current user`);
            console.log(`   POST /api/request - Submit relief request`);
            console.log(`   GET  /api/queue - View priority queue`);
            console.log(`   POST /api/dequeue - Get highest priority request`);
            console.log(`   PUT  /api/update-status/:id - Update request status`);
            console.log(`   GET  /api/my-requests - Get user's requests`);
            console.log(`   GET  /api/stats - Get admin statistics`);
            console.log(`   GET  /api/config - Get configuration options\n`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
});

// Start the server
startServer();

module.exports = { app, server, io };
