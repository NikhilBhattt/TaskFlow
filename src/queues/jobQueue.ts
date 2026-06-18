import { Queue } from "bullmq";

const jobQueue = new Queue("jobs", {
  connection: {
    host: "localhost",
    port: 6379,
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
