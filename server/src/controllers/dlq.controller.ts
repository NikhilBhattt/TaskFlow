import { isValidObjectId } from "mongoose";
import jobsModel from "../models/jobs.model.js";
import deadLetterQueue, { getDeadLetterJobs } from "../queues/deadLetterQueue.js";
import { addJob } from "../queues/jobQueue.js";
import asyncHandler from "../utils/asyncHandler.js";
import type { Request, Response } from "express";

const getAllFailedJobs = asyncHandler(async (req: Request, res: Response) => {
  const result = await getDeadLetterJobs();

  const jobs = result.map((job) => {
    return {
      // dlqId is the id of the entry inside the dead-letter queue; it is what the retry route expects.
      dlqId: job.id,
      originalId: job.data.originalId,
      mongoJobId: job.data.mongoJobId,
      originalType: job.data.originalType,
      error: job.data.error,
      failedAt: job.data.failedAt,
    };
  });

  return res.status(200).json({ success: true, jobs });
});

const retryFailedJob = asyncHandler(async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0]?.trim() : rawId?.trim();

  if (!id) {
    return res.status(400).json({ success: false, message: "Job Id is required!" });
  }

  const failedJob = await deadLetterQueue.getJob(id);

  if (!failedJob) {
    return res.status(404).json({ success: false, message: "Failed job not found!" });
  }

  const { mongoJobId, payload, error: previousError } = failedJob.data;
  const originalType = failedJob.data.originalType ?? "email";

  // The MongoDB record may have been deleted since the job failed. Re-running it would
  // execute work nobody can track, so drop the stale DLQ entry instead.
  if (!mongoJobId || !isValidObjectId(mongoJobId) || !(await jobsModel.findById(mongoJobId))) {
    await failedJob.remove();
    return res.status(404).json({
      success: false,
      message: "The original job record no longer exists; removed it from the dead-letter queue.",
    });
  }

  // Write the new status BEFORE enqueueing: a worker can pick the job up within
  // milliseconds and set "processing", and a later write here would overwrite that.
  await jobsModel.updateOne(
    { _id: mongoJobId },
    { status: "queued", retryCount: 0, error: null },
  );

  const newJob = await addJob(originalType, { payload, mongoJobId });

  if (!newJob) {
    await jobsModel.updateOne(
      { _id: mongoJobId },
      { status: "failed", error: previousError },
    );
    return res.status(503).json({ success: false, message: "Unable to retry this job." });
  }

  await jobsModel.updateOne({ _id: mongoJobId }, { bullJobId: newJob.id });

  await failedJob.remove();

  return res.status(201).json({ success: true, newJob });
});

export { getAllFailedJobs, retryFailedJob };
