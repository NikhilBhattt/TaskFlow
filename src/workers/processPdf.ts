import jobsModel from "../models/jobs.model.js";
import { jobQueue } from "../queues/jobQueue.js";
import { generatePdfReport } from "../services/pdf.service.js";

export const processPdf = async (data: any) => {
  const filePath = await generatePdfReport(data);

  const job = await jobQueue.getJob(data.jobId);

  await jobsModel.updateOne(
    { _id: job?.data.mongoJobId },
    { pdfPath: filePath }
  );

  return filePath;
};
