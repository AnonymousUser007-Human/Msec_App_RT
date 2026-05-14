import { createHash } from "crypto";
import { access, readFile } from "fs/promises";
import path from "path";

export type UploadedFolderFile = {
  absolutePath: string;
  publicPath: string;
  relativePath: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export type FolderManifestFile = {
  name: string;
  path: string;
  url: string;
  mimeType: string;
  size: number;
};

export type FolderManifest = {
  kind: "folder";
  name: string;
  files: FolderManifestFile[];
};

/** Extrait le nom de fichier sous `/uploads/` depuis l’URL ou le chemin stocké en `content`. */
export function uploadsBasenameFromMessageContent(content: string): string | null {
  const strip = (content.split("?")[0] ?? content).trim();
  try {
    if (strip.startsWith("/uploads/")) {
      const base = path.basename(strip);
      return base || null;
    }
    const u = new URL(strip);
    if (u.pathname.startsWith("/uploads/")) {
      return path.basename(u.pathname) || null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function sha256File(absPath: string): Promise<string> {
  const buf = await readFile(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

/** Hash SHA-256 d’un fichier déjà stocké dans `uploads/` (même logique que les pièces jointes). */
export async function computeFileHashFromMessageContent(content: string): Promise<string | null> {
  const name = uploadsBasenameFromMessageContent(content);
  if (!name || name.includes("..")) return null;
  const root = path.resolve(path.join(process.cwd(), "uploads"));
  const resolved = path.resolve(path.join(root, name));
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  try {
    await access(resolved);
  } catch {
    return null;
  }
  return sha256File(resolved);
}

export function normalizeFolderRelativePath(value: string, fallbackName: string): string {
  const normalized = value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "." && part !== "..")
    .join("/");
  return normalized || fallbackName;
}

export function folderNameFromRelativePaths(paths: string[], fallback = "Dossier"): string {
  const first = paths.find((p) => p.trim().length > 0);
  if (!first) return fallback;
  const top = normalizeFolderRelativePath(first, fallback).split("/")[0];
  return top || fallback;
}

export function buildFolderManifest(name: string, files: UploadedFolderFile[]): FolderManifest {
  return {
    kind: "folder",
    name,
    files: files.map((file) => ({
      name: path.basename(file.relativePath) || file.originalName,
      path: file.relativePath,
      url: file.publicPath,
      mimeType: file.mimeType,
      size: file.size,
    })),
  };
}

export async function sha256FolderManifest(files: UploadedFolderFile[]): Promise<string> {
  const entries = await Promise.all(
    files.map(async (file) => ({
      path: file.relativePath,
      size: file.size,
      hash: await sha256File(file.absolutePath),
    })),
  );
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
