import { Worker } from "bullmq";

const initializeJobWorker = () => {
  const jobWorker = new Worker(
    "jobs",
    async (job) => {
      console.log("processing Job:", job.id);
    },
    {
      connection: {
        host: "localhost",
        port: 6379,
      },
    },
  );
  return jobWorker;
};

export default initializeJobWorker;
