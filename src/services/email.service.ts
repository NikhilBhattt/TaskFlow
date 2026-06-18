import nodemailer from "nodemailer";
import config from "../config/config.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASSWORD,
  },
});

export const sendEmail = async (to: string, subject: string, text: string) => {
  await transporter.sendMail(
    {
      from: config.EMAIL_USER,
      to,
      subject,
      text,
    },
    (err, info) => {
      if (err) {
        throw new Error(err.message);
      }
    },
  );
};
