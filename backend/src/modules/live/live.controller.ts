import type { Request, Response, NextFunction } from "express";
import { startLiveSchema } from "./live.schema.js";
import * as liveService from "./live.service.js";
import { routeParam } from "../../utils/routeParam.js";

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rooms = await liveService.listActiveRooms();
    res.json(rooms);
  } catch (e) {
    next(e);
  }
}

export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = startLiveSchema.parse(req.body);
    const room = await liveService.startRoom(req.user!.id, body.title);
    res.status(201).json(room);
  } catch (e) {
    next(e);
  }
}

export async function join(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await liveService.joinRoom(req.user!.id, routeParam(req, "id"));
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function leave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await liveService.leaveRoom(req.user!.id, routeParam(req, "id"));
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function end(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await liveService.endRoom(req.user!.id, routeParam(req, "id"));
    res.json(result);
  } catch (e) {
    next(e);
  }
}
