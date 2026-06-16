import type { NextFunction, Request, Response } from "express";

const asyncHandler = (fn: Function) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error: Error | any) {
      console.log("Error from AsyncHandler");
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
};

export default asyncHandler;
