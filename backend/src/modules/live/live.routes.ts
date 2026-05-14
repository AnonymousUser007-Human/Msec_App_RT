import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./live.controller.js";

const r = Router();

r.use(authMiddleware);

r.get("/", ctrl.list);
r.post("/", ctrl.start);
r.post("/:id/join", ctrl.join);
r.post("/:id/leave", ctrl.leave);
r.post("/:id/end", ctrl.end);

export const liveRouter = r;
