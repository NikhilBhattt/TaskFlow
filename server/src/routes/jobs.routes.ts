import { Router } from "express";
import {
  getJob,
  getAllJobs,
  createJob,
  deleteJob,
  deleteAllJobs,
} from "../controllers/jobs.controller.js";

const router = Router();

router.get("/jobs/:id", getJob);

router.get("/jobs", getAllJobs);

router.post("/jobs", createJob);

router.delete("/jobs/:id", deleteJob);

router.delete("/jobs", deleteAllJobs);

export default router;
