import { Router } from "express";
import { getAllFailedJobs, retryFailedJob } from "../controllers/dlq.controller.js";

const router = Router();

router.get("/failed-jobs", getAllFailedJobs);

router.post("/failed-jobs/:id/retry", retryFailedJob);

export default router;
