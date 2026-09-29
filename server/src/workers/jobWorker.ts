import { Worker, Job } from "bullmq";
import jobsModel from "../models/jobs.model.js";
import deadLetterQueue from "../queues/deadLetterQueue.js";
import { processEmail } from "./processEmail.js";
import { processPdf } from "./processPdf.js";
import { redisConnection } from "../config/redis.js";

let jobWorker: Worker;

const initializeJobWorker = () => {
  jobWorker = new Worker("jobs", async (job) => await handleJobWorker(job), {
    connection: redisConnection,
    concurrency: 5,
  });

  // Without this listener a Redis outage would surface as an unhandled 'error' event.
  jobWorker.on("error", (err) => {
    console.error("Worker error:", err.message);
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
    console.log(`Job ${job.id} completed (attempts used: ${job.attemptsMade + 1})`);
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
      await processPdf({
        jobId: String(job.id),
        mongoJobId: job.data.mongoJobId,
        content: job.data.payload.content,
      });
      break;

    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
};

export { initializeJobWorker };
