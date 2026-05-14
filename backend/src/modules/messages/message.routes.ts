import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./message.controller.js";

const r = Router();

r.use(authMiddleware);

r.post("/:id/forward", ctrl.forward);
r.patch("/:id", ctrl.edit);
r.patch("/:id/read", ctrl.patchRead);
r.delete("/:id", ctrl.remove);

export const messageRouter = r;
