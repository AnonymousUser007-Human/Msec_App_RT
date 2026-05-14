import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./user.controller.js";

const r = Router();

r.use(authMiddleware);

r.get("/", ctrl.list);
r.get("/search", ctrl.search);
r.patch("/me", ctrl.patchMe);
r.get("/:id", ctrl.getById);

export const userRouter = r;
