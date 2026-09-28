import { createServer } from "http";
import app from "./index.js";
import config from "./config/config.js";
import { initializeJobWorker } from "./workers/jobWorker.js";
import connectDB from "./db/connectDB.js";

const server = createServer(app);

server.listen(config.PORT, async () => {
  await connectDB();
  initializeJobWorker();
  console.log(`Server listening on PORT ${config.PORT}`);
});
