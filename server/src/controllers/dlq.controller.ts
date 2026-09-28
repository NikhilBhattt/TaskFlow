import jobsModel from "../models/jobs.model.js";
import deadLetterQueue from "../queues/deadLetterQueue.js";
import { jobQueue, addJob } from "../queues/jobQueue.js";
import asyncHandler from "../utils/asyncHandler.js";
import type { Request, Response } from "express";

const getAllFailedJobs = asyncHandler(async (req: Request, res: Response) => {
  const result = await deadLetterQueue.getJobs(["waiting", "completed", "delayed"]);

  const jobs = result.map((job) => {
    return {
      originalId: job.data.originalId,
      mongoJobId: job.data.mongoJobId,
      error: job.data.error,
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

  const failedJob = await deadLetterQueue.getJob(id as string);

  if (!failedJob) {
    return res.status(404).json({ success: false, message: "Failed job not found!" });
  }

  const originalType = failedJob.data.originalType ?? "email";
  const newJob = await addJob(originalType, {
    payload: failedJob.data.payload,
    mongoJobId: failedJob.data.mongoJobId,
  });

  if (!newJob) {
    return res.status(400).json({ success: false, message: "Unable to retry this job." });
  }

  await jobsModel.updateOne(
    {
      _id: failedJob.data.mongoJobId,
    },
    {
      bullJobId: newJob.id,
      status: "queued",
      error: null,
    },
  );

  await failedJob.remove();

  return res.status(201).json({ success: true, newJob });
});

export { getAllFailedJobs, retryFailedJob };
