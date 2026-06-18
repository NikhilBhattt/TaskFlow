import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

interface JobReport {
  jobId: string;
  content: string;
}

export const generatePdfReport = async (data: JobReport): Promise<string> => {
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

    stream.on("finish", () => {
      resolve(filePath);
    });

    stream.on("error", reject);
  });
};
