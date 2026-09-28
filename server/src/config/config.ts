import { configDotenv } from "dotenv";
configDotenv();

const config = {
  PORT: process.env.PORT || 5000,

  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",

  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/TaskFlow",

  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: process.env.REDIS_PORT || 6379,

  EMAIL_USER: process.env.EMAIL_USER || undefined,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || undefined,

  CLOUDINARY_URL: process.env.CLOUDINARY_URL || undefined,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || undefined,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || undefined,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || undefined
};

export default config;
