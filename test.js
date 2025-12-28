const ReliefRequest = require("./models/ReliefRequest");
const calculatePriority = require("./utils/priorityCalculator");
const MaxHeap = require("./services/priorityQueue");

const heap = new MaxHeap();

const requestData = [
    {id: 1, name : "ramesh", district: "Gwalior", aidType: "Medicine", vulnerabilityScore : 4,  medicalUrgencyScore: 5},
    {id: 2, name : "sita", district: "indore", aidType: "Food", vulnerabilityScore : 1,  medicalUrgencyScore: 2},
    {id: 3, name : "Asha", district: "Bhopal", aidType: "Medicine", vulnerabilityScore : 4,  medicalUrgencyScore: 5}    
]
