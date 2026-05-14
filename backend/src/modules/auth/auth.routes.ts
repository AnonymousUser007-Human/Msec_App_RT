import { Router } from "express";
import * as ctrl from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const r = Router();

r.post("/register", ctrl.register);
r.post("/login", ctrl.login);
r.get("/me", authMiddleware, ctrl.me);

export const authRouter = r;
