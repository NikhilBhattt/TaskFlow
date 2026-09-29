import { Queue, type Job } from "bullmq";
import { producerConnection } from "../config/redis.js";

// Dead Letter Queue: holds jobs that exhausted all retry attempts.
// Nothing consumes this queue; entries stay here until they are retried or purged via the API.
const deadLetterQueue = new Queue("failed-jobs", {
  connection: producerConnection,
});

const getDeadLetterJobs = (): Promise<Job[]> =>
  deadLetterQueue.getJobs(["waiting", "delayed", "completed"]);

// Removes every DLQ entry that belongs to the given MongoDB job id.
const removeDeadLetterEntriesForJob = async (mongoJobId: string) => {
  const entries = await getDeadLetterJobs();
  await Promise.all(
    entries
      .filter((entry) => String(entry.data.mongoJobId) === mongoJobId)
      .map((entry) => entry.remove()),
  );
};

export default deadLetterQueue;
export { getDeadLetterJobs, removeDeadLetterEntriesForJob };
