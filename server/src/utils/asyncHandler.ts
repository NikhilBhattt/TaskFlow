import type { NextFunction, Request, Response } from "express";

const asyncHandler = (fn: Function) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error: Error | any) {
      console.error("Error from AsyncHandler:", error);

      if (res.headersSent) {
        return next(error);
      }

      return res.status(500).json({
        success: false,
        message: error?.message || "Internal server error",
      });
    }
  };
};

export default asyncHandler;
