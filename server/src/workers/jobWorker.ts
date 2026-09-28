import { Worker, Job } from "bullmq";
import jobsModel from "../models/jobs.model.js";
import deadLetterQueue from "../queues/deadLetterQueue.js";
import { processEmail } from "./processEmail.js";
import { processPdf } from "./processPdf.js";
import config from "../config/config.js";

let jobWorker: Worker;

const initializeJobWorker = () => {
  jobWorker = new Worker("jobs", async (job) => await handleJobWorker(job), {
    connection: {
      host: config.REDIS_HOST,
      port: Number(config.REDIS_PORT),
    },
    concurrency: 5,
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
    const errorMessage = err instanceof Error ? err.message : String(err);

    await jobsModel.updateOne(
      { _id: job.data.mongoJobId },
      {
        retryCount: job.attemptsMade,
        ...(isFinalFailure && {
          status: "failed",
          error: errorMessage,
        }),
      },
    );

    if (isFinalFailure) {
      await deadLetterQueue.add("failed-job", {
        originalId: job.id,
        originalType: job.name,
        payload: job.data.payload,
        mongoJobId: job.data.mongoJobId,
        error: errorMessage,
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

  switch (job.name) {
    case "email":
      await processEmail(job.data.payload);
      break;

    case "pdf":
      await processPdf({ jobId: String(job.id), content: job.data.payload.content });
      break;

    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
};

const getJobWorker = () => {
  if (!jobWorker) initializeJobWorker();
  return jobWorker;
};

export { initializeJobWorker, getJobWorker };
