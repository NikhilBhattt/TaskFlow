import { delay, Worker, Job } from "bullmq";
import jobsModel from "../models/jobs.model.js";

let jobWorker: Worker;

const initializeJobWorker = () => {
  jobWorker = new Worker("jobs", async (job) => await callback(job), {
    connection: {
      host: "localhost",
      port: 6379,
    },
  });
  jobWorker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  jobWorker.on("failed", (job, err) => {
    console.log(`Job ${job?.id} failed`);
    console.log(err.message);
  });
};

const callback = async (job: Job) => {
  await jobsModel.updateOne({ bullJobId: job.id }, { status: "processing" });

  const job_fromDB = await jobsModel.findOne({ bullJobId: job.id });

  if (!job_fromDB) return;

  await delay(10000);
  job_fromDB.status = "completed";
  await job_fromDB.save();
};

const getJobWorker = () => {
  if (!jobWorker) initializeJobWorker();
  return jobWorker;
};

export { initializeJobWorker, getJobWorker };
