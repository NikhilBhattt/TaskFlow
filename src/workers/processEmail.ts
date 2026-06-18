import { sendEmail } from "../services/email.service.js";

const processEmail = async (payload: {
  to: string;
  subject: string;
  message: string;
}) => {
  await sendEmail(payload.to, payload.subject, payload.message);
};


export {processEmail}