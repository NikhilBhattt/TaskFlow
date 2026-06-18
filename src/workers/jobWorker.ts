import { delay, Worker, Job } from "bullmq";
import jobsModel from "../models/jobs.model.js";
import processEmail from "../utils/processEmail.js";
import deadLetterQueue from "../queues/deadLetterQueue.js";

let jobWorker: Worker;

const initializeJobWorker = () => {
  jobWorker = new Worker("jobs", async (job) => await handleJobWorker(job), {
    connection: {
      host: "localhost",
      port: 6379,
    },
  });

  jobWorker.on("completed", async (job) => {
    if (!job) return;

    await jobsModel.updateOne(
      { _id: job.data.mongoJobId },
      {
        status: "completed",
        completedAt: new Date(),
      },
    );
    console.log(`Job ${job.id} completed after ${job.attemptsMade} retries`);
  });

  jobWorker.on("failed", async (job, err) => {
    if (!job) return;

    const isFinalFailure = job.attemptsMade >= (job.opts.attempts ?? 1);

    await jobsModel.updateOne(
      { _id: job.data.mongoJobId },
      {
        retryCount: job.attemptsMade,
        ...(isFinalFailure && {
          status: "failed",
          error: err.message,
        }),
      },
    );

    if (isFinalFailure) {
      await deadLetterQueue.add("failed-job", {
        originalId: job.id,
        originalType: job.name,
        payload: job.data.payload,
        mongoJobId: job.data.mongoJobId,
        error: err.message,
        failedAt: new Date(),
      });

      console.log(`Job ${job.id} failed. Maximum attempts reached!`);
      return;
    }
    console.log(`Job ${job.id} failed. Attempt ${job.attemptsMade}`);
  });
};

const handleJobWorker = async (job: Job) => {
  if (job.attemptsMade === 0) {
    await jobsModel.updateOne(
      { _id: job.data.mongoJobId },
      { status: "processing" },
    );
  }

  await delay(5000);

  if (false) {
    throw new Error("Random failure");
  }
};

const getJobWorker = () => {
  if (!jobWorker) initializeJobWorker();
  return jobWorker;
};

export { initializeJobWorker, getJobWorker };
