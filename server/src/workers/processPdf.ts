import jobsModel from "../models/jobs.model.js";
import { jobQueue } from "../queues/jobQueue.js";
import { generatePdfReport } from "../services/pdf.service.js";

interface UploadResult {
  url: string;
  publicId: string;
}

export const processPdf = async (data: any) => {
  const { url, publicId }: UploadResult = await generatePdfReport(data);

  const job = await jobQueue.getJob(data.jobId);

  await jobsModel.updateOne(
    { _id: job?.data.mongoJobId },
    { pdfUrl: url, pdfPublicId: publicId },
  );
  
};
