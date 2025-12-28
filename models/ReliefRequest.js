const mongoose = require('mongoose');

// Vulnerability category to score mapping
const VULNERABILITY_SCORES = {
    'pregnant': 5,
    'elderly': 4,
    'child': 4,
    'disabled': 3,
    'adult': 1
};

// Medical urgency type to score mapping
const MEDICAL_URGENCY_SCORES = {
    'life-saving-medicine': 5,
    'serious-injury': 4,
    'regular-medicine': 3,
    'food-water': 2,
    'shelter': 1
};

const reliefRequestSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    location: {
        district: {
            type: String,
            required: [true, 'District is required'],
            trim: true
        },
        latitude: {
            type: Number,
            default: null
        },
        longitude: {
            type: Number,
            default: null
        },
        address: {
            type: String,
            trim: true
        }
    },
    aidType: {
        type: String,
        required: [true, 'Aid type is required'],
        enum: ['life-saving-medicine', 'serious-injury', 'regular-medicine', 'food-water', 'shelter']
    },
    vulnerabilityCategory: {
        type: String,
        required: [true, 'Vulnerability category is required'],
        enum: ['pregnant', 'elderly', 'child', 'disabled', 'adult']
    },
    vulnerabilityScore: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    medicalUrgencyScore: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    priorityScore: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['PENDING', 'IN_TRANSIT', 'DELIVERED'],
        default: 'PENDING'
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    contactPhone: {
        type: String,
        trim: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    deliveredAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Calculate priority score based on the formula
reliefRequestSchema.methods.calculatePriority = function () {
    const now = new Date();
    const waitingTimeMs = now - new Date(this.createdAt);
    const waitingTimeMinutes = waitingTimeMs / 60000;

    // Priority formula: (vulnerabilityScore × 5) + (medicalUrgencyScore × 10) + (waitingTimeInMinutes × 0.1)
    const W1 = 5;   // Weight for vulnerability
    const W2 = 10;  // Weight for medical urgency
    const W3 = 0.1; // Weight for waiting time

    this.priorityScore =
        (this.vulnerabilityScore * W1) +
        (this.medicalUrgencyScore * W2) +
        (waitingTimeMinutes * W3);

    return this.priorityScore;
};

// Pre-save hook to set scores from categories and calculate priority
reliefRequestSchema.pre('save', function (next) {
    // Set vulnerability score from category if not already set
    if (this.vulnerabilityCategory && !this.vulnerabilityScore) {
        this.vulnerabilityScore = VULNERABILITY_SCORES[this.vulnerabilityCategory] || 1;
    }

    // Set medical urgency score from aid type if not already set
    if (this.aidType && !this.medicalUrgencyScore) {
        this.medicalUrgencyScore = MEDICAL_URGENCY_SCORES[this.aidType] || 1;
    }

    // Calculate initial priority
    this.calculatePriority();

    next();
});

// Static method to get priority scores mapping
reliefRequestSchema.statics.getVulnerabilityScores = function () {
    return VULNERABILITY_SCORES;
};

reliefRequestSchema.statics.getMedicalUrgencyScores = function () {
    return MEDICAL_URGENCY_SCORES;
};

// Index for efficient queries
reliefRequestSchema.index({ status: 1, priorityScore: -1 });
reliefRequestSchema.index({ requestedBy: 1 });
reliefRequestSchema.index({ assignedTo: 1 });

const ReliefRequest = mongoose.model('ReliefRequest', reliefRequestSchema);

module.exports = ReliefRequest;