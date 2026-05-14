import webpush from "web-push";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = env.VAPID_PUBLIC_KEY;
  const priv = env.VAPID_PRIVATE_KEY;
  const subj = env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) return false;
  webpush.setVapidDetails(subj, pub, priv);
  vapidConfigured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export function buildPushMessageBody(msg: { type: string; content: string }): string {
  if (msg.type === "text") {
    return msg.content.length > 120 ? `${msg.content.slice(0, 117)}…` : msg.content;
  }
  if (msg.type === "image") return "Nouvelle image";
  if (msg.type === "audio") return "Nouveau message vocal";
  if (msg.type === "video") return "Nouvelle vidéo";
  return "Nouveau fichier";
}

/**
 * Envoie un Web Push à chaque abonnement des destinataires (A → B).
 * Ne bloque pas l’API : erreurs loguées, abonnements 410 supprimés.
 */
export async function notifyRecipientsOfNewMessage(
  recipientUserIds: string[],
  payload: { senderName: string; conversationId: string; body: string },
): Promise<void> {
  if (!recipientUserIds.length) return;
  if (!ensureVapid()) return;

  const url = `/?openConversation=${encodeURIComponent(payload.conversationId)}`;
  const data = JSON.stringify({
    title: payload.senderName,
    body: payload.body,
    url,
  });

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: recipientUserIds } },
  });

  for (const row of subs) {
    const subscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    try {
      await webpush.sendNotification(subscription, data, {
        TTL: 60 * 60,
        urgency: "normal",
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "statusCode" in err ? (err as { statusCode: number }).statusCode : 0;
      if (code === 404 || code === 410) {
        await prisma.pushSubscription.delete({ where: { id: row.id } }).catch(() => {});
      } else {
        console.warn("[push] envoi échoué", code, err);
      }
    }
  }
}
