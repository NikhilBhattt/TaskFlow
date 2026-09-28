import { connect } from "mongoose";
import config from "../config/config.js";

const connectDB = async () => {
  try {
    const connectionURI = config.MONGODB_URI;
    await connect(connectionURI);

    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

export default connectDB;