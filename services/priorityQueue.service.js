const { getRedisClient } = require('../config/redis');
const { calculatePriority } = require('../utils/priorityCalculator');

const REDIS_QUEUE_KEY = 'relief:priority_queue';

/**
 * Max Heap Priority Queue Implementation
 * Uses Binary Heap data structure for O(log n) insert and extract operations
 * Integrates with Redis for persistence
 */
class MaxHeapPriorityQueue {
    constructor() {
        this.heap = [];
        this.requestMap = new Map(); // For O(1) lookup by ID
    }

    /**
     * Get parent index
     */
    getParentIndex(index) {
        return Math.floor((index - 1) / 2);
    }

    /**
     * Get left child index
     */
    getLeftChildIndex(index) {
        return 2 * index + 1;
    }

    /**
     * Get right child index
     */
    getRightChildIndex(index) {
        return 2 * index + 2;
    }

    /**
     * Check if node has parent
     */
    hasParent(index) {
        return this.getParentIndex(index) >= 0;
    }

    /**
     * Check if node has left child
     */
    hasLeftChild(index) {
        return this.getLeftChildIndex(index) < this.heap.length;
    }

    /**
     * Check if node has right child
     */
    hasRightChild(index) {
        return this.getRightChildIndex(index) < this.heap.length;
    }

    /**
     * Get parent node
     */
    parent(index) {
        return this.heap[this.getParentIndex(index)];
    }

    /**
     * Get left child node
     */
    leftChild(index) {
        return this.heap[this.getLeftChildIndex(index)];
    }

    /**
     * Get right child node
     */
    rightChild(index) {
        return this.heap[this.getRightChildIndex(index)];
    }

    /**
     * Swap two nodes
     */
    swap(index1, index2) {
        const temp = this.heap[index1];
        this.heap[index1] = this.heap[index2];
        this.heap[index2] = temp;
    }

    /**
     * Insert a new request into the priority queue
     * Time Complexity: O(log n)
     */
    insert(request) {
        // Calculate current priority
        request.priorityScore = calculatePriority(
            request.vulnerabilityScore,
            request.medicalUrgencyScore,
            request.createdAt
        );

        this.heap.push(request);
        this.requestMap.set(request._id.toString(), this.heap.length - 1);
        this.bubbleUp(this.heap.length - 1);

        // Sync with Redis
        this.syncToRedis();

        return request;
    }

    /**
     * Bubble up to maintain max heap property
     * Time Complexity: O(log n)
     */
    bubbleUp(index) {
        while (this.hasParent(index) && this.parent(index).priorityScore < this.heap[index].priorityScore) {
            const parentIndex = this.getParentIndex(index);
            this.swap(parentIndex, index);
            this.updateMapIndices(parentIndex, index);
            index = parentIndex;
        }
    }

    /**
     * Extract the highest priority request
     * Time Complexity: O(log n)
     */
    extractMax() {
        if (this.heap.length === 0) {
            return null;
        }

        if (this.heap.length === 1) {
            const max = this.heap.pop();
            this.requestMap.delete(max._id.toString());
            this.syncToRedis();
            return max;
        }

        const max = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.requestMap.delete(max._id.toString());

        if (this.heap.length > 0) {
            this.requestMap.set(this.heap[0]._id.toString(), 0);
            this.sinkDown(0);
        }

        this.syncToRedis();
        return max;
    }

    /**
     * Sink down to maintain max heap property
     * Time Complexity: O(log n)
     */
    sinkDown(index) {
        while (this.hasLeftChild(index)) {
            let largerChildIndex = this.getLeftChildIndex(index);

            if (this.hasRightChild(index) &&
                this.rightChild(index).priorityScore > this.leftChild(index).priorityScore) {
                largerChildIndex = this.getRightChildIndex(index);
            }

            if (this.heap[index].priorityScore >= this.heap[largerChildIndex].priorityScore) {
                break;
            }

            this.swap(index, largerChildIndex);
            this.updateMapIndices(index, largerChildIndex);
            index = largerChildIndex;
        }
    }

    /**
     * Update map indices after swap
     */
    updateMapIndices(index1, index2) {
        if (this.heap[index1]) {
            this.requestMap.set(this.heap[index1]._id.toString(), index1);
        }
        if (this.heap[index2]) {
            this.requestMap.set(this.heap[index2]._id.toString(), index2);
        }
    }

    /**
     * Peek at the highest priority request without removing
     * Time Complexity: O(1)
     */
    peek() {
        return this.heap.length > 0 ? this.heap[0] : null;
    }

    /**
     * Get current queue size
     * Time Complexity: O(1)
     */
    size() {
        return this.heap.length;
    }

    /**
     * Check if queue is empty
     */
    isEmpty() {
        return this.heap.length === 0;
    }

    /**
     * Get all requests sorted by priority (highest first)
     */
    getAll() {
        // Recalculate all priorities first
        this.recalculateAllPriorities();

        // Return sorted copy
        return [...this.heap].sort((a, b) => b.priorityScore - a.priorityScore);
    }

    /**
     * Recalculate priorities for all requests (accounts for waiting time)
     */
    recalculateAllPriorities() {
        for (let i = 0; i < this.heap.length; i++) {
            this.heap[i].priorityScore = calculatePriority(
                this.heap[i].vulnerabilityScore,
                this.heap[i].medicalUrgencyScore,
                this.heap[i].createdAt
            );
        }

        // Rebuild heap
        this.buildHeap();
    }

    /**
     * Build heap from array (heapify)
     * Time Complexity: O(n)
     */
    buildHeap() {
        for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
            this.sinkDown(i);
        }

        // Update map
        this.heap.forEach((request, index) => {
            this.requestMap.set(request._id.toString(), index);
        });
    }

    /**
     * Remove a specific request by ID
     */
    removeById(requestId) {
        const index = this.requestMap.get(requestId.toString());

        if (index === undefined) {
            return null;
        }

        const request = this.heap[index];

        // Swap with last element
        const lastIndex = this.heap.length - 1;
        if (index !== lastIndex) {
            this.swap(index, lastIndex);
        }

        this.heap.pop();
        this.requestMap.delete(requestId.toString());

        if (index < this.heap.length) {
            // Re-heapify from this position
            this.sinkDown(index);
            this.bubbleUp(index);
        }

        this.syncToRedis();
        return request;
    }

    /**
     * Update a request's priority
     */
    updatePriority(requestId, newRequest) {
        const index = this.requestMap.get(requestId.toString());

        if (index === undefined) {
            return null;
        }

        const oldPriority = this.heap[index].priorityScore;
        this.heap[index] = { ...this.heap[index], ...newRequest };
        this.heap[index].priorityScore = calculatePriority(
            this.heap[index].vulnerabilityScore,
            this.heap[index].medicalUrgencyScore,
            this.heap[index].createdAt
        );

        // Re-heapify based on priority change
        if (this.heap[index].priorityScore > oldPriority) {
            this.bubbleUp(index);
        } else {
            this.sinkDown(index);
        }

        this.syncToRedis();
        return this.heap[index];
    }

    /**
     * Load queue from array of requests
     */
    loadFromArray(requests) {
        this.heap = requests.map(req => ({
            ...req,
            priorityScore: calculatePriority(
                req.vulnerabilityScore,
                req.medicalUrgencyScore,
                req.createdAt
            )
        }));

        this.buildHeap();
    }

    /**
     * Sync current queue to Redis
     */
    async syncToRedis() {
        try {
            const redis = getRedisClient();
            if (!redis) return;

            // Clear existing queue
            await redis.del(REDIS_QUEUE_KEY);

            // Add all items to sorted set
            if (this.heap.length > 0) {
                const items = this.heap.map(req => ({
                    score: req.priorityScore,
                    value: JSON.stringify({
                        _id: req._id,
                        name: req.name,
                        location: req.location,
                        aidType: req.aidType,
                        vulnerabilityCategory: req.vulnerabilityCategory,
                        vulnerabilityScore: req.vulnerabilityScore,
                        medicalUrgencyScore: req.medicalUrgencyScore,
                        priorityScore: req.priorityScore,
                        status: req.status,
                        createdAt: req.createdAt
                    })
                }));

                for (const item of items) {
                    await redis.zAdd(REDIS_QUEUE_KEY, { score: item.score, value: item.value });
                }
            }
        } catch (error) {
            console.error('Redis sync error:', error);
        }
    }

    /**
     * Load queue from Redis
     */
    async loadFromRedis() {
        try {
            const redis = getRedisClient();
            if (!redis) return false;

            const items = await redis.zRange(REDIS_QUEUE_KEY, 0, -1, { REV: true });

            if (items && items.length > 0) {
                const requests = items.map(item => JSON.parse(item));
                this.loadFromArray(requests);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Redis load error:', error);
            return false;
        }
    }

    /**
     * Clear the entire queue
     */
    async clear() {
        this.heap = [];
        this.requestMap.clear();

        try {
            const redis = getRedisClient();
            if (redis) {
                await redis.del(REDIS_QUEUE_KEY);
            }
        } catch (error) {
            console.error('Redis clear error:', error);
        }
    }
}

// Singleton instance
let priorityQueueInstance = null;

const getPriorityQueue = () => {
    if (!priorityQueueInstance) {
        priorityQueueInstance = new MaxHeapPriorityQueue();
    }
    return priorityQueueInstance;
};

module.exports = {
    MaxHeapPriorityQueue,
    getPriorityQueue
};
