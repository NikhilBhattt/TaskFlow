import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import config from "./config/config.js";
import jobRoutes from "./routes/jobs.routes.js";
import dlqRoutes from "./routes/dlq.routes.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(helmet());
app.use(morgan("dev"));

app.get("/health", async (req, res) => {
  return res.status(200).json({ message: "Health Route!" });
});

app.use("/api", jobRoutes);
app.use("/api", dlqRoutes);

// Return JSON (not Express's default HTML page) for malformed bodies and unexpected errors.
const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err?.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ success: false, message: "Request body is not valid JSON." });
  }

  console.error("Unhandled error:", err);
  return res
    .status(500)
    .json({ success: false, message: "Internal server error" });
};

app.use(errorHandler);

export default app;
