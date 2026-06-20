import { Queue } from "bullmq";
import config from "../config/config.js";

const jobQueue = new Queue("jobs", {
  connection: {
    host: config.REDIS_HOST,
    port: Number(config.REDIS_PORT),
  },
});

async function addJob(type: string, data: object): Promise<Queue | any> {
  try {
    const newJob = await jobQueue.add(type, data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    });

    return newJob;
  } catch (error) {
    console.error("Error while Adding Job:", error);
    return null;
  }
}

export { jobQueue, addJob };
