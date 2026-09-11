import type { ChatMessage } from "./chat";

export const STORAGE_KEY = "geto-conversation-v1";
const mediaPaths = new Set([
  "/images/geto.webp",
  "/images/shrine.svg",
  "/images/spirit.svg",
]);

export function parseHistory(raw: string | null): ChatMessage[] | null {
  try {
    const parsed: unknown = JSON.parse(raw || "null");
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 151)
      return null;
    const ids = new Set<string>();
    let previousRole: string | undefined;
    const messages: ChatMessage[] = [];
    for (const value of parsed) {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.id !== "string" ||
        ids.has(value.id) ||
        (value.role !== "assistant" && value.role !== "user") ||
        value.role === previousRole ||
        typeof value.content !== "string" ||
        !value.content.trim() ||
        value.content.length > 6000 ||
        typeof value.timestamp !== "number" ||
        !Number.isFinite(value.timestamp) ||
        Math.abs(value.timestamp) > 8.64e15
      )
        return null;
      const image =
        value.image &&
        typeof value.image.src === "string" &&
        mediaPaths.has(value.image.src) &&
        typeof value.image.alt === "string"
          ? { src: value.image.src, alt: value.image.alt }
          : undefined;
      messages.push({
        id: value.id,
        role: value.role,
        content: value.content,
        timestamp: value.timestamp,
        ...(image ? { image } : {}),
      });
      previousRole = value.role;
      ids.add(value.id);
    }
    return messages.at(-1)?.role === "assistant" ? messages : null;
  } catch {
    return null;
  }
}

export function serializeHistory(messages: ChatMessage[]): string {
  // Generated PNGs can exceed browser storage quotas; only curated media is persisted.
  return JSON.stringify(
    messages.map((message) => ({
      ...message,
      image:
        message.image && mediaPaths.has(message.image.src)
          ? message.image
          : undefined,
    })),
  );
}
