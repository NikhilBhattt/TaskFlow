import { Queue } from "bullmq";

const jobQueue = new Queue("jobs", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

async function addJob() {
  await jobQueue.add("email", {
    email: "test@gmail.com",
  });
}

export {jobQueue, addJob};
