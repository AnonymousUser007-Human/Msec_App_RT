import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { uploadMiddleware } from "../../config/multer.js";
import * as ctrl from "./conversation.controller.js";

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

r.post("/", ctrl.create);
r.get("/", ctrl.list);
r.get("/:id/messages", ctrl.listMessages);
r.post("/:id/messages", ctrl.postMessage);
r.post("/:id/messages/upload", uploadSingle, ctrl.postMessageUpload);
r.post("/:id/read", ctrl.markAllRead);
r.get("/:id", ctrl.getOne);

export const conversationRouter = r;
