import { Service } from "typedi";

type Job = () => Promise<void>;

@Service()
export class JobQueueService {
    private queue: Job[] = [];
    private isProcessing = false;
    private intervalMs: number;

    constructor(intervalMs: number = 2000) {
        this.intervalMs = intervalMs;
    }

    add(job: Job) {
        this.queue.push(job);
        if (!this.isProcessing) this.processQueue();
    }

    addMultiple(jobs: Job[]) {
        this.queue.push(...jobs);
        if (!this.isProcessing) this.processQueue();
    }

    private processQueue() {
        this.isProcessing = true;

        const interval = setInterval(async () => {
            if (this.queue.length === 0) {
                clearInterval(interval);
                this.isProcessing = false;
                return;
            }

            const job = this.queue.shift();
            if (!job) return;

            try {
                await job();
            } catch (err) {
                console.error("❌ Job failed:", err);
            }
        }, this.intervalMs);
    }
}
