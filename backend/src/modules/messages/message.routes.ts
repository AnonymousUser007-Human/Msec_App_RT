import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./message.controller.js";

const r = Router();

r.use(authMiddleware);

r.patch("/:id/read", ctrl.patchRead);
r.delete("/:id", ctrl.remove);

export const messageRouter = r;
