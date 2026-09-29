import { Queue, type Job } from "bullmq";
import { producerConnection } from "../config/redis.js";

const jobQueue = new Queue("jobs", {
  connection: producerConnection,
});

// Returns the created BullMQ job, or null if enqueueing failed.
async function addJob(type: string, data: object): Promise<Job | null> {
  try {
    return await jobQueue.add(type, data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    });
  } catch (error) {
    console.error("Error while adding job:", error);
    return null;
  }
}

export { jobQueue, addJob };
