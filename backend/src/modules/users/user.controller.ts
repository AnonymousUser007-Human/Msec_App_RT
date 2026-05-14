import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../../utils/httpError.js";
import { listUsersQuerySchema, searchUsersQuerySchema, updateMeSchema } from "./user.schema.js";
import * as userService from "./user.service.js";
import { routeParam } from "../../utils/routeParam.js";

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = listUsersQuerySchema.parse(req.query);
    const result = await userService.listUsers(req.user!.id, q);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = searchUsersQuerySchema.parse(req.query);
    const result = await userService.searchUsers(req.user!.id, q);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await userService.getUserById(req.user!.id, routeParam(req, "id"));
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function patchMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = updateMeSchema.parse(req.body);
    const result = await userService.updateMe(req.user!.id, body);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function postMeAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new HttpError(400, "Image requise");
    }
    const relativePath = `/uploads/${req.file.filename}`;
    const result = await userService.setAvatarFromUpload(req.user!.id, relativePath);
    res.json(result);
  } catch (e) {
    next(e);
  }
}
