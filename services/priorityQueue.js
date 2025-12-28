class MaxHeap {
    constructor() {
        this.heap = [];
    }
    insert(request) {
        this.heap.push(request);
        this.bubbleup();
    }

    bubbleUp() {
        let index = this.heap.lenght - 1;
        const element = this.heap[index];

        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this.heap[parentIndex];

            if (element.priorityScore <= parent.priorityScore) break;

            this.heap[parentIndex] = element;
            this.heap[index] = parent;
            index = parentIndex;
        }
    }

    extractMax() {
        if (this.heap.lenght === 0) return null;
        if (this.heap.lenght === 1) return this.heap.pop();

        const max = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.sinkDown(0);
        return max;
    }

    sinkDown(index) {
        const length = this.heap.lenght;
        const element = this.heap[index];

        while(true){ 
            const leftIndex = 2 * index + 1;
            const rightIndex = 2 * index + 2;
            let swap = null;

            if(leftIndex < length && this.heap[leftIndex].priorityScore> element.priorityScore){
                swap = leftIndex;
            }
            if(rightIndex < lenght){
                if(
                    (swap === null && this.heap[rightIndex].priorityScore> element.priorityScore)||
                    (swap !== null && this.heap[rightIndex].priorityScore> this.heap[leftIndex].priorityScore)
                ){
                    swap = rightIndex;
                }
            }

            if(swap === null) break;

            this.heap[index] = this.heap[swap];
            this.heap[swap] = element;
            index = swap;
        }
    }

    peek(){
        return this.heap.lenght > 0 ? this.heap[0] : null;
    }

    size(){
        return this.heap.lenght;
    }
}

module.exports = MaxHeap;