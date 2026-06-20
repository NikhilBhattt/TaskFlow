import jobsModel from "../models/jobs.model.js";
import deadLetterQueue from "../queues/deadLetterQueue.js";
import { jobQueue, addJob } from "../queues/jobQueue.js";
import asyncHandler from "../utils/asyncHandler.js";
import type { Request, Response } from "express";
import z from "zod";

const getAllJobs = asyncHandler(async (req: Request, res: Response) => {
  const allJobs = await jobsModel
    .find()
    .select("type payload status pdfUrl pdfPublicId retryCount error");

  return res.status(200).json({ success: true, allJobs });
});

const getJob = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Job Id is required!" });
  }

  const job = await jobsModel.findById(id).select("status error");

  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found!" });
  }

  return res.status(200).json({ success: true, job });
});

const createJob = asyncHandler(async (req: Request, res: Response) => {
  const { type, payload } = req.body;

  if (!type || !payload) {
    return res
      .status(400)
      .json({ success: false, message: "Missing Type and Payload data!" });
  }

  const JobSchema = z.enum(["email", "pdf", "image"]);

  const validate = JobSchema.safeParse(type);

  if (!validate) {
    res.status(400).json({ success: false, message: "Invalid Job Type" });
  }

  const mongoJob = await jobsModel.create({
    type,
    payload,
  });

  const newBullJob = await addJob(type, { payload, mongoJobId: mongoJob._id });

  if (!newBullJob) {
    return res
      .status(400)
      .json({ success: false, message: "Please try again!" });
  }

  mongoJob.bullJobId = newBullJob.id;
  await mongoJob.save();

  return res.status(201).json({ success: true, mongoJob });
});

const deleteJob = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Job Id is required!" });
  }

  const job = await jobsModel.findById(id);

  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found!" });
  }

  const success = await jobQueue.remove(job.bullJobId as string);
  if (!success) {
    return res
      .status(400)
      .json({ success: false, message: "Error occured! please try again." });
  }

  await job.deleteOne();
  return res.status(200).json({ success: true, message: "Job removed" });
});

const deleteAllJobs = asyncHandler(async (req: Request, res: Response) => {
  await Promise.all([
    jobsModel.deleteMany({}),
    jobQueue.pause(),
    jobQueue.obliterate({ force: true }),
    deadLetterQueue.pause(),
    deadLetterQueue.obliterate({ force: true }),
  ]);

  return res.json({
    success: true,
    message: "All jobs deleted",
  });
});

export { getJob, getAllJobs, createJob, deleteJob, deleteAllJobs };
