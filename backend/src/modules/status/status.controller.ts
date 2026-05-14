import type { Request, Response, NextFunction } from "express";
import path from "path";
import { MessageType } from "@prisma/client";
import { createTextStatusSchema, updateTextStatusSchema } from "./status.schema.js";
import * as statusService from "./status.service.js";
import { HttpError } from "../../utils/httpError.js";
import { routeParam } from "../../utils/routeParam.js";

function typeFromMime(mime: string): MessageType {
  if (mime.startsWith("image/")) return MessageType.image;
  if (mime.startsWith("video/")) return MessageType.video;
  if (mime.startsWith("audio/")) return MessageType.audio;
  return MessageType.file;
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await statusService.listActiveStatuses();
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createText(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createTextStatusSchema.parse(req.body);
    const row = await statusService.createTextStatus(req.user!.id, body.content);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function createUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new HttpError(400, "Fichier requis");
    const row = await statusService.createMediaStatus(req.user!.id, {
      content: `/uploads/${req.file.filename}`,
      type: typeFromMime(req.file.mimetype),
      attachmentName: path.basename(req.file.originalname),
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await statusService.deleteStatus(req.user!.id, routeParam(req, "id"));
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = updateTextStatusSchema.parse(req.body);
    const row = await statusService.updateTextStatus(req.user!.id, routeParam(req, "id"), body.content);
    res.json(row);
  } catch (e) {
    next(e);
  }
}
