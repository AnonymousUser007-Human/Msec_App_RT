import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { isPushConfigured } from "./push.service.js";

const subscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().min(1).optional(),
});

export const pushRouter = Router();

pushRouter.get("/config", (_req, res) => {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });
});

pushRouter.post("/subscribe", authMiddleware, async (req, res, next) => {
  try {
    if (!isPushConfigured()) {
      res.status(503).json({ error: "Web Push non configuré (VAPID) sur le serveur" });
      return;
    }
    const body = subscribeSchema.parse(req.body);
    const userId = req.user!.id;
    if (body.endpoint.length > 767) {
      res.status(400).json({ error: "Endpoint trop long pour ce serveur (max 767 caractères)" });
      return;
    }
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      update: {
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

pushRouter.post("/unsubscribe", authMiddleware, async (req, res, next) => {
  try {
    const body = unsubscribeSchema.parse(req.body);
    const userId = req.user!.id;
    if (body.endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { userId, endpoint: body.endpoint },
      });
    } else {
      await prisma.pushSubscription.deleteMany({ where: { userId } });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
