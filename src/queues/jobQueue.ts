import { Queue } from "bullmq";

const jobQueue = new Queue("jobs", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

async function addJob(type: string, data: object): Promise<Queue | any> {
  try {
    const newJob = await jobQueue.add(type, data);
    console.log("New Job added in Queue:", newJob.id);
    return newJob;
  } catch (error) {
    console.error("Error while Adding Job:", error);
  }
}

export { jobQueue, addJob };
