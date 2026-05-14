import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { uploadMiddleware } from "../../config/multer.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./status.controller.js";

const r = Router();

r.use(authMiddleware);

function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  uploadMiddleware.single("file")(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

r.get("/", ctrl.list);
r.post("/", ctrl.createText);
r.post("/upload", uploadSingle, ctrl.createUpload);
r.patch("/:id", ctrl.update);
r.delete("/:id", ctrl.remove);

export const statusRouter = r;
