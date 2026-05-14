import { createHash } from "crypto";
import { access, readFile } from "fs/promises";
import path from "path";

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
