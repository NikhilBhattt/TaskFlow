import jobsModel from "../models/jobs.model.js";
import { generatePdfReport } from "../services/pdf.service.js";

interface ProcessPdfInput {
  jobId: string;
  mongoJobId: string;
  content: string;
}

// Generates the PDF, uploads it to Cloudinary, and stores the resulting URL on the MongoDB job record.
export const processPdf = async ({ jobId, mongoJobId, content }: ProcessPdfInput) => {
  const { url, publicId } = await generatePdfReport({ jobId, content });

  await jobsModel.updateOne(
    { _id: mongoJobId },
    { pdfUrl: url, pdfPublicId: publicId },
  );
};
