import fs from "fs";
import path from "path";
import multer from "multer";
import { randomUUID } from "crypto";
import { env } from "../config/env.js";

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const maxBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: maxBytes },
  fileFilter: (_req, file, cb) => {
    const okMime =
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/msword" ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!okMime) {
      cb(new Error("Type de fichier non autorisé"));
      return;
    }
    cb(null, true);
  },
});
