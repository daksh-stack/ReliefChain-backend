/**
 * Priority Calculator Utility
 * Calculates dynamic priority score for relief requests
 * 
 * Formula: priorityScore = (vulnerabilityScore × 5) + (medicalUrgencyScore × 10) + (waitingTimeInMinutes × 0.1)
 */

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

// Weights for priority calculation
const WEIGHTS = {
    VULNERABILITY: 5,
    MEDICAL_URGENCY: 10,
    WAITING_TIME: 0.1
};

/**
 * Calculate priority score for a relief request
 * @param {number} vulnerabilityScore - Score from 1-5
 * @param {number} medicalUrgencyScore - Score from 1-5
 * @param {Date|string} createdAt - When the request was created
 * @returns {number} Calculated priority score
 */
function calculatePriority(vulnerabilityScore, medicalUrgencyScore, createdAt) {
    const now = new Date();
    const createdTime = new Date(createdAt);
    const waitingTimeMs = now - createdTime;
    const waitingTimeMinutes = Math.max(0, waitingTimeMs / 60000);

    const priorityScore =
        (vulnerabilityScore * WEIGHTS.VULNERABILITY) +
        (medicalUrgencyScore * WEIGHTS.MEDICAL_URGENCY) +
        (waitingTimeMinutes * WEIGHTS.WAITING_TIME);

    return Math.round(priorityScore * 100) / 100; // Round to 2 decimal places
}

/**
 * Get vulnerability score from category
 * @param {string} category - Vulnerability category
 * @returns {number} Vulnerability score
 */
function getVulnerabilityScore(category) {
    return VULNERABILITY_SCORES[category.toLowerCase()] || 1;
}

/**
 * Get medical urgency score from aid type
 * @param {string} aidType - Type of aid requested
 * @returns {number} Medical urgency score
 */
function getMedicalUrgencyScore(aidType) {
    return MEDICAL_URGENCY_SCORES[aidType.toLowerCase()] || 1;
}

/**
 * Calculate full priority from categories
 * @param {string} vulnerabilityCategory - Vulnerability category
 * @param {string} aidType - Type of aid
 * @param {Date|string} createdAt - Creation time
 * @returns {Object} Scores and calculated priority
 */
function calculateFullPriority(vulnerabilityCategory, aidType, createdAt) {
    const vulnerabilityScore = getVulnerabilityScore(vulnerabilityCategory);
    const medicalUrgencyScore = getMedicalUrgencyScore(aidType);
    const priorityScore = calculatePriority(vulnerabilityScore, medicalUrgencyScore, createdAt);

    return {
        vulnerabilityScore,
        medicalUrgencyScore,
        priorityScore
    };
}

module.exports = {
    calculatePriority,
    getVulnerabilityScore,
    getMedicalUrgencyScore,
    calculateFullPriority,
    VULNERABILITY_SCORES,
    MEDICAL_URGENCY_SCORES,
    WEIGHTS
};