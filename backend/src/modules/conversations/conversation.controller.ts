import type { Request, Response, NextFunction } from "express";
import { createConversationSchema, listMessagesQuerySchema, createMessageSchema } from "./conversation.schema.js";
import * as convService from "./conversation.service.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { routeParam } from "../../utils/routeParam.js";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createConversationSchema.parse(req.body);
    const conv = await convService.createPrivateConversation(req.user!.id, body);
    res.status(201).json(conv);
  } catch (e) {
    next(e);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await convService.listConversations(req.user!.id);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const conv = await convService.getConversationDto(req.user!.id, routeParam(req, "id"));
    res.json(conv);
  } catch (e) {
    next(e);
  }
}

export async function listMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = listMessagesQuerySchema.parse(req.query);
    const data = await convService.listMessages(req.user!.id, routeParam(req, "id"), q);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function postMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createMessageSchema.parse(req.body);
    const msg = await convService.createMessage(req.user!.id, routeParam(req, "id"), body);
    res.status(201).json(msg);
  } catch (e) {
    next(e);
  }
}

export async function postMessageUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new HttpError(400, "Fichier requis");
    }
    const publicPath = `/uploads/${req.file.filename}`;
    const base = env.PUBLIC_BASE_URL?.replace(/\/$/, "");
    const content = base ? `${base}${publicPath}` : publicPath;
    const type = req.file.mimetype.startsWith("image/") ? ("image" as const) : ("file" as const);
    const msg = await convService.createMessage(req.user!.id, routeParam(req, "id"), { content, type });
    res.status(201).json(msg);
  } catch (e) {
    next(e);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await convService.markConversationRead(req.user!.id, routeParam(req, "id"));
    res.json(result);
  } catch (e) {
    next(e);
  }
}
