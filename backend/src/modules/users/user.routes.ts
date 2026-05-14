import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { avatarUploadMiddleware } from "../../config/multer.js";
import * as ctrl from "./user.controller.js";

const r = Router();

r.use(authMiddleware);

function uploadAvatarSingle(req: Request, res: Response, next: NextFunction): void {
  avatarUploadMiddleware.single("avatar")(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

r.get("/", ctrl.list);
r.get("/search", ctrl.search);
r.patch("/me", ctrl.patchMe);
r.post("/me/avatar", uploadAvatarSingle, ctrl.postMeAvatar);
r.get("/:id", ctrl.getById);

export const userRouter = r;
