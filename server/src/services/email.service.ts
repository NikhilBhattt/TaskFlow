import nodemailer from "nodemailer";
import config from "../config/config.js";

const transporter = config.EMAIL_USER && config.EMAIL_PASSWORD
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASSWORD,
      },
    })
  : null;

export const sendEmail = async (to: string, subject: string, text: string) => {
  if (!config.EMAIL_USER || !config.EMAIL_PASSWORD || !transporter) {
    throw new Error("Email credentials are not set in the environment variables.");
  }

  if (!to || !subject || !text) {
    throw new Error("Missing required email parameters.");
  }

  await transporter.sendMail({
    from: config.EMAIL_USER,
    to,
    subject,
    text,
  });
};
