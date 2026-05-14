import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as convService from "../conversations/conversation.service.js";
import { routeParam } from "../../utils/routeParam.js";

const deleteQuerySchema = z.object({
  scope: z.enum(["all", "me"]).default("me"),
});

const forwardBodySchema = z.object({
  conversationId: z.string().min(1),
});

export async function patchRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await convService.markMessageReadById(req.user!.id, routeParam(req, "id"));
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { scope } = deleteQuerySchema.parse(req.query);
    const result = await convService.deleteMessage(req.user!.id, routeParam(req, "id"), scope);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function forward(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = forwardBodySchema.parse(req.body);
    const result = await convService.forwardMessage(req.user!.id, routeParam(req, "id"), body.conversationId);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}
