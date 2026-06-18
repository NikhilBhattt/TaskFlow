import jobsModel from "../models/jobs.model.js";
import deadLetterQueue from "../queues/deadLetterQueue.js";
import { jobQueue, addJob } from "../queues/jobQueue.js";
import asyncHandler from "../utils/asyncHandler.js";
import type { Request, Response } from "express";

const getAllFailedJobs = asyncHandler(async (req: Request, res: Response) => {
  const result = await deadLetterQueue.getJobs(["waiting", "completed"]);

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
  const id = req.params.id;

  const failedJob = await deadLetterQueue.getJob(id as string);

  if (!failedJob) {
    return res.status(400).json({ success: true, message: "Invalid Job Id!" });
  }

  const newJob = await addJob(failedJob.data.originalType, {
    payload: failedJob.data.payload,
    mongoJobId: failedJob.data.mongoJobId,
  });

  await jobsModel.updateOne(
    {
      _id: failedJob.data.mongoJobId,
    },
    {
      bullJobId: newJob.id,
      status: "processing",
      error: null,
    },
  );

  await failedJob.remove();

  return res.status(201).json({ success: true, newJob });
});

export { getAllFailedJobs, retryFailedJob };
