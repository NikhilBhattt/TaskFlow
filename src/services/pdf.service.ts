import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { uploadPDFtoCloudinary } from "./cloudinary.service.js";

interface JobReport {
  jobId: string;
  content: string;
}

interface UploadResult {
  url: string;
  publicId: string;
}

export const generatePdfReport = async (
  data: JobReport,
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const reportsDir = path.join(process.cwd(), "reports");

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const fileName = `job-${data.jobId}.pdf`;

    const filePath = path.join(reportsDir, fileName);

    const doc = new PDFDocument();

    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    doc.fontSize(24).text("TaskFlow Job Report", {
      align: "center",
    });

    doc.moveDown();

    doc.fontSize(14);

    doc.text(`Job ID: ${data.jobId}`);
    doc.text(`Job content: ${data.content}`);

    doc.moveDown();

    doc.text("This report was generated asynchronously using BullMQ workers.");

    doc.end();

    stream.on("finish", async () => {
      try {
        const uploadResult: UploadResult =
          await uploadPDFtoCloudinary(filePath);
        fs.unlinkSync(filePath);
        resolve(uploadResult);
      } catch (error) {
        reject(error);
      }
    });

    stream.on("error", reject);
  });
};
