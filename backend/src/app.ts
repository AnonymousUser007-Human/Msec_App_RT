import "./types/express.js";
import express from "express";
import path from "path";
import cors from "cors";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { conversationRouter } from "./modules/conversations/conversation.routes.js";
import { messageRouter } from "./modules/messages/message.routes.js";
import { pushRouter } from "./modules/push/push.routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

const app = express();

const corsOrigin =
  env.CORS_ORIGIN === "*"
    ? true
    : env.CORS_ORIGIN.split(",").map((s) => s.trim()).length === 1
      ? env.CORS_ORIGIN.split(",")[0]!.trim()
      : env.CORS_ORIGIN.split(",").map((s) => s.trim());

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

const healthPayload = { ok: true as const };

app.get("/", (_req, res) => {
  res.json(healthPayload);
});

app.get("/health", (_req, res) => {
  res.json(healthPayload);
});

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/conversations", conversationRouter);
app.use("/api/messages", messageRouter);
app.use("/api/push", pushRouter);

app.use(errorMiddleware);

export default app;
