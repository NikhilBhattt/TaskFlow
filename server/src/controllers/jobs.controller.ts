import { isValidObjectId } from "mongoose";
import jobsModel from "../models/jobs.model.js";
import deadLetterQueue, {
  removeDeadLetterEntriesForJob,
} from "../queues/deadLetterQueue.js";
import { jobQueue, addJob } from "../queues/jobQueue.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateJobInput } from "../utils/jobValidation.js";
import type { Request, Response } from "express";

const getAllJobs = asyncHandler(async (req: Request, res: Response) => {
  const allJobs = await jobsModel
    .find()
    .select(
      "type payload status pdfUrl pdfPublicId retryCount error createdAt completedAt",
    )
    .sort({ createdAt: -1 });

  return res.status(200).json({ success: true, allJobs });
});

const getJob = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || !isValidObjectId(id)) {
    return res
      .status(400)
      .json({ success: false, message: "A valid job id is required!" });
  }

  const job = await jobsModel
    .findById(id)
    .select(
      "type payload status pdfUrl pdfPublicId retryCount error createdAt completedAt",
    );

  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found!" });
  }

  return res.status(200).json({ success: true, job });
});

const createJob = asyncHandler(async (req: Request, res: Response) => {
  const { type, payload } = req.body ?? {};

  if (!type || payload === undefined) {
    return res
      .status(400)
      .json({ success: false, message: "Missing Type and Payload data!" });
  }

  const validation = validateJobInput(type, payload);

  if (!validation.ok) {
    return res.status(400).json({
      success: false,
      message: validation.message,
    });
  }

  const mongoJob = await jobsModel.create({
    type: validation.type,
    payload: validation.payload,
  });

  const newBullJob = await addJob(validation.type, {
    payload: validation.payload,
    mongoJobId: mongoJob._id,
  });

  if (!newBullJob) {
    // Enqueue failed: don't leave a "queued" record behind that no worker will ever pick up.
    await mongoJob.deleteOne();
    return res.status(503).json({
      success: false,
      message: "Could not enqueue the job. Please try again.",
    });
  }

  mongoJob.bullJobId = newBullJob.id;
  await mongoJob.save();

  return res.status(201).json({ success: true, mongoJob });
});

const deleteJob = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || !isValidObjectId(id)) {
    return res
      .status(400)
      .json({ success: false, message: "A valid job id is required!" });
  }

  const job = await jobsModel.findById(id);

  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found!" });
  }

  if (job.bullJobId) {
    try {
      // Returns 0 if the job is already gone from Redis, which is fine here.
      await jobQueue.remove(job.bullJobId);
    } catch {
      // BullMQ throws when the job is locked, i.e. a worker is processing it right now.
      return res.status(409).json({
        success: false,
        message: "Job is being processed right now. Try again in a moment.",
      });
    }
  }

  await removeDeadLetterEntriesForJob(String(job._id));
  await job.deleteOne();
  return res.status(200).json({ success: true, message: "Job removed" });
});

const deleteAllJobs = asyncHandler(async (req: Request, res: Response) => {
  await jobsModel.deleteMany({});

  // obliterate() requires a paused queue, so pause first and wait for it.
  await jobQueue.pause();
  await jobQueue.obliterate({ force: true });
  await deadLetterQueue.pause();
  await deadLetterQueue.obliterate({ force: true });

  return res.json({
    success: true,
    message: "All jobs deleted",
  });
});

export { getJob, getAllJobs, createJob, deleteJob, deleteAllJobs };
