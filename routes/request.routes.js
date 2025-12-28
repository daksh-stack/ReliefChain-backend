const express = require('express');
const router = express.Router();
const ReliefRequest = require('../models/ReliefRequest');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const { getPriorityQueue } = require('../services/priorityQueue.service');
const { calculateFullPriority, VULNERABILITY_SCORES, MEDICAL_URGENCY_SCORES } = require('../utils/priorityCalculator');

// Get socket.io instance (will be set by server.js)
let io = null;
const setSocketIO = (socketIO) => {
    io = socketIO;
};

/**
 * @route   POST /api/request
 * @desc    Submit a new relief request
 * @access  Private (Victim only)
 */
router.post('/', verifyToken, requireRole('victim', 'admin'), async (req, res) => {
    try {
        const {
            name,
            location,
            aidType,
            vulnerabilityCategory,
            description,
            contactPhone
        } = req.body;

        // Validate required fields
        if (!name || !location?.district || !aidType || !vulnerabilityCategory) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, district, aid type, and vulnerability category'
            });
        }

        // Validate aid type
        if (!Object.keys(MEDICAL_URGENCY_SCORES).includes(aidType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid aid type. Must be one of: ${Object.keys(MEDICAL_URGENCY_SCORES).join(', ')}`
            });
        }

        // Validate vulnerability category
        if (!Object.keys(VULNERABILITY_SCORES).includes(vulnerabilityCategory)) {
            return res.status(400).json({
                success: false,
                message: `Invalid vulnerability category. Must be one of: ${Object.keys(VULNERABILITY_SCORES).join(', ')}`
            });
        }

        // Calculate initial priority
        const { vulnerabilityScore, medicalUrgencyScore, priorityScore } = calculateFullPriority(
            vulnerabilityCategory,
            aidType,
            new Date()
        );

        // Create new relief request
        const reliefRequest = new ReliefRequest({
            name,
            location: {
                district: location.district,
                latitude: location.latitude || null,
                longitude: location.longitude || null,
                address: location.address || ''
            },
            aidType,
            vulnerabilityCategory,
            vulnerabilityScore,
            medicalUrgencyScore,
            priorityScore,
            description: description || '',
            contactPhone: contactPhone || '',
            requestedBy: req.user._id,
            status: 'PENDING'
        });

        await reliefRequest.save();

        // Add to priority queue
        const queue = getPriorityQueue();
        queue.insert(reliefRequest.toObject());

        // Emit real-time event
        if (io) {
            io.emit('newRequest', {
                request: reliefRequest,
                queueSize: queue.size()
            });

            // If this is a high priority request, emit a special alert
            if (priorityScore >= 50) {
                io.emit('highPriorityAlert', {
                    message: `High priority request received: ${name} - ${aidType}`,
                    request: reliefRequest
                });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Relief request submitted successfully',
            data: {
                request: reliefRequest,
                queuePosition: queue.size()
            }
        });

    } catch (error) {
        console.error('Create request error:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while creating request'
        });
    }
});

/**
 * @route   GET /api/queue
 * @desc    Get current priority queue
 * @access  Private (Volunteer/Admin)
 */
router.get('/queue', verifyToken, requireRole('volunteer', 'admin'), async (req, res) => {
    try {
        const queue = getPriorityQueue();

        // Get all requests sorted by priority
        const requests = queue.getAll();

        res.json({
            success: true,
            data: {
                queue: requests,
                size: requests.length,
                highestPriority: queue.peek()
            }
        });

    } catch (error) {
        console.error('Get queue error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching queue'
        });
    }
});

/**
 * @route   POST /api/dequeue
 * @desc    Dequeue highest priority request and assign to volunteer
 * @access  Private (Volunteer only)
 */
router.post('/dequeue', verifyToken, requireRole('volunteer', 'admin'), async (req, res) => {
    try {
        const queue = getPriorityQueue();

        if (queue.isEmpty()) {
            return res.status(404).json({
                success: false,
                message: 'Queue is empty. No pending requests.'
            });
        }

        // Extract highest priority request
        const highestPriority = queue.extractMax();

        if (!highestPriority) {
            return res.status(404).json({
                success: false,
                message: 'No pending requests found'
            });
        }

        // Update request in database
        const updatedRequest = await ReliefRequest.findByIdAndUpdate(
            highestPriority._id,
            {
                status: 'IN_TRANSIT',
                assignedTo: req.user._id
            },
            { new: true }
        ).populate('requestedBy', 'name email phone');

        if (!updatedRequest) {
            return res.status(404).json({
                success: false,
                message: 'Request not found in database'
            });
        }

        // Emit real-time event
        if (io) {
            io.emit('requestDequeued', {
                request: updatedRequest,
                assignedTo: req.user.name,
                queueSize: queue.size()
            });

            io.emit('queueUpdated', {
                queue: queue.getAll(),
                size: queue.size()
            });
        }

        res.json({
            success: true,
            message: 'Request assigned successfully',
            data: {
                request: updatedRequest,
                remainingQueueSize: queue.size()
            }
        });

    } catch (error) {
        console.error('Dequeue error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while dequeuing request'
        });
    }
});

/**
 * @route   PUT /api/update-status/:id
 * @desc    Update request status
 * @access  Private (Volunteer only)
 */
router.put('/update-status/:id', verifyToken, requireRole('volunteer', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['PENDING', 'IN_TRANSIT', 'DELIVERED'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        const updateData = { status };

        // If delivered, set delivery time
        if (status === 'DELIVERED') {
            updateData.deliveredAt = new Date();
        }

        const updatedRequest = await ReliefRequest.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        ).populate('requestedBy', 'name email phone')
            .populate('assignedTo', 'name email phone');

        if (!updatedRequest) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        // If status is changed back to PENDING, add back to queue
        if (status === 'PENDING') {
            const queue = getPriorityQueue();
            queue.insert(updatedRequest.toObject());
        }

        // Emit real-time event
        if (io) {
            io.emit('statusUpdated', {
                requestId: id,
                newStatus: status,
                request: updatedRequest
            });
        }

        res.json({
            success: true,
            message: 'Status updated successfully',
            data: {
                request: updatedRequest
            }
        });

    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating status'
        });
    }
});

/**
 * @route   GET /api/my-requests
 * @desc    Get current user's requests
 * @access  Private
 */
router.get('/my-requests', verifyToken, async (req, res) => {
    try {
        const requests = await ReliefRequest.find({ requestedBy: req.user._id })
            .sort({ createdAt: -1 })
            .populate('assignedTo', 'name email phone');

        res.json({
            success: true,
            data: {
                requests,
                count: requests.length
            }
        });

    } catch (error) {
        console.error('Get my requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching requests'
        });
    }
});

/**
 * @route   GET /api/assigned-requests
 * @desc    Get requests assigned to current volunteer
 * @access  Private (Volunteer only)
 */
router.get('/assigned-requests', verifyToken, requireRole('volunteer', 'admin'), async (req, res) => {
    try {
        const requests = await ReliefRequest.find({
            assignedTo: req.user._id,
            status: { $in: ['IN_TRANSIT', 'DELIVERED'] }
        })
            .sort({ createdAt: -1 })
            .populate('requestedBy', 'name email phone');

        res.json({
            success: true,
            data: {
                requests,
                count: requests.length
            }
        });

    } catch (error) {
        console.error('Get assigned requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching assigned requests'
        });
    }
});

/**
 * @route   GET /api/stats
 * @desc    Get dashboard statistics
 * @access  Private (Admin only)
 */
router.get('/stats', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        const [total, pending, inTransit, delivered] = await Promise.all([
            ReliefRequest.countDocuments(),
            ReliefRequest.countDocuments({ status: 'PENDING' }),
            ReliefRequest.countDocuments({ status: 'IN_TRANSIT' }),
            ReliefRequest.countDocuments({ status: 'DELIVERED' })
        ]);

        // Get aid type distribution
        const aidTypeStats = await ReliefRequest.aggregate([
            { $group: { _id: '$aidType', count: { $sum: 1 } } }
        ]);

        // Get vulnerability distribution
        const vulnerabilityStats = await ReliefRequest.aggregate([
            { $group: { _id: '$vulnerabilityCategory', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: {
                overview: {
                    total,
                    pending,
                    inTransit,
                    delivered
                },
                aidTypeDistribution: aidTypeStats,
                vulnerabilityDistribution: vulnerabilityStats
            }
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching stats'
        });
    }
});

/**
 * @route   GET /api/config
 * @desc    Get configuration options (aid types, vulnerability categories)
 * @access  Public
 */
router.get('/config', (req, res) => {
    res.json({
        success: true,
        data: {
            vulnerabilityCategories: Object.entries(VULNERABILITY_SCORES).map(([key, score]) => ({
                value: key,
                label: key.charAt(0).toUpperCase() + key.slice(1),
                score
            })),
            aidTypes: Object.entries(MEDICAL_URGENCY_SCORES).map(([key, score]) => ({
                value: key,
                label: key.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                score
            }))
        }
    });
});

module.exports = router;
module.exports.setSocketIO = setSocketIO;
