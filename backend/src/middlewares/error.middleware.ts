import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { HttpError } from "../utils/httpError.js";

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Fichier trop volumineux" });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof Error && err.message === "Type de fichier non autorisé") {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Données invalides", details: err.flatten() });
    return;
  }
  const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: number }).status) : 500;
  const message =
    typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : "Erreur interne";
  if (status >= 500) {
    console.error(err);
  }
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
}
