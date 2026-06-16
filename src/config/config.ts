import { configDotenv } from "dotenv";
configDotenv();

const config = {
  PORT: process.env.PORT || 5000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/TaskFlow",
};

export default config;
