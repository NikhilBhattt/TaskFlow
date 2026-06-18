import { Schema, model } from "mongoose";

const JobSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["email", "pdf", "image"],
      required: true,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "cancelled"],
      default: "queued",
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    pdfPath: {
      type: String,
    },
    bullJobId: {
      type: String,
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    completedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

export default model("Job", JobSchema);
