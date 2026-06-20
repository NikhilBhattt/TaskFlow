import { Queue } from "bullmq";
import config from "../config/config.js";

const deadLetterQueue = new Queue("failed-jobs", {
  connection: {
    host: config.REDIS_HOST,
    port: Number(config.REDIS_PORT),
  },
});

export default deadLetterQueue;
