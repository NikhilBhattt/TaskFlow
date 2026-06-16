import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import config from "./config/config.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(helmet());
app.use(morgan("dev"));

app.get("/health", async (req, res) => {
  return res.status(200).json({ message: "Health Route!" });
});

export default app;
