import { Queue } from "bullmq";

const deadLetterQueue = new Queue("failed-jobs", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

export default deadLetterQueue;
