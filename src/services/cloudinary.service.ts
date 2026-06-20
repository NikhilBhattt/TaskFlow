import cloudinary from "../config/cloudinary.js";

export const uploadPDFtoCloudinary = async (filePath: string) => {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "raw",
    folder: "taskflow/reports",
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
};
