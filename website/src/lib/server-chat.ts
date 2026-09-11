// Server entry point: only the route imports this module. Never expose its configuration to clients.
import {
  CHAT_MEDIA,
  CHAT_STYLES,
  type ChatImage,
  type ChatStyle,
} from "./chat";
import {
  boundaryReply,
  identityQuestion,
  scriptedText,
  SYSTEM_PROMPT,
  STYLE_DIRECTIONS,
} from "./geto-persona";
import {
  imageIntent,
  chooseMedia,
  portraitDirection,
  customPortraitRequested,
} from "./geto-media";
export { imageIntent, chooseMedia, portraitDirection } from "./geto-media";

type Turn = { role: "user" | "assistant"; content: string };
type Invitation = "path" | "power" | "truth";
export type ChatInput = {
  messages: Turn[];
  invitation?: Invitation;
  style?: ChatStyle;
  expectedMode?: "live" | "demo";
  requestImage?: boolean;
};
export type ChatResult = {
  text: string;
  image?: ChatImage;
  mode: "live" | "demo";
};
type Environment = Record<string, string | undefined>;

export const LIMITS = {
  messages: 150,
  messageCharacters: 6_000,
  totalCharacters: 100_000,
  requestBytes: 700_000,
  providerTextBytes: 100_000,
  imageBase64Characters: 8 * 1024 * 1024,
  providerImageBytes: 9 * 1024 * 1024,
  bodyTimeoutMs: 5_000,
  chatTimeoutMs: 20_000,
  imageTimeoutMs: 45_000,
} as const;

export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateChatInput(value: unknown): ChatInput {
  if (!record(value) || !Array.isArray(value.messages)) {
    throw new ChatError(400, "Передайте историю разговора в поле messages.");
  }
  if (value.messages.length === 0 || value.messages.length > LIMITS.messages) {
    throw new ChatError(
      400,
      "История должна содержать от 1 до 150 сообщений. Начните новую беседу, если достигнут предел.",
    );
  }
  if (
    value.invitation !== undefined &&
    !["path", "power", "truth"].includes(value.invitation as string)
  ) {
    throw new ChatError(400, "Неизвестное приглашение в разговор.");
  }
  if (
    value.requestImage !== undefined &&
    typeof value.requestImage !== "boolean"
  ) {
    throw new ChatError(
      400,
      "Поле requestImage должно быть логическим значением.",
    );
  }
  if (
    value.style !== undefined &&
    !CHAT_STYLES.includes(value.style as ChatStyle)
  ) {
    throw new ChatError(400, "Неизвестный стиль разговора.");
  }
  if (
    value.expectedMode !== undefined &&
    value.expectedMode !== "live" &&
    value.expectedMode !== "demo"
  ) {
    throw new ChatError(400, "Неизвестный режим разговора.");
  }
  let total = 0;
  let previousRole: Turn["role"] | undefined;
  const messages = value.messages.map((message: unknown): Turn => {
    if (
      !record(message) ||
      (message.role !== "user" && message.role !== "assistant")
    ) {
      throw new ChatError(400, "Допустимы только роли user и assistant.");
    }
    if (
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > LIMITS.messageCharacters
    ) {
      throw new ChatError(
        400,
        "Каждое сообщение должно содержать от 1 до 6000 символов и не быть пустым.",
      );
    }
    if (previousRole === message.role) {
      throw new ChatError(
        400,
        "Реплики пользователя и персонажа должны чередоваться.",
      );
    }
    previousRole = message.role;
    total += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (total > LIMITS.totalCharacters) {
    throw new ChatError(
      413,
      "История превышает 100 000 символов. Начните новую беседу: сообщения не обрезаются автоматически.",
    );
  }
  if (messages.at(-1)?.role !== "user") {
    throw new ChatError(
      400,
      "Последняя реплика должна принадлежать пользователю.",
    );
  }
  return {
    messages,
    ...(value.style !== undefined ? { style: value.style as ChatStyle } : {}),
    ...(value.expectedMode !== undefined
      ? { expectedMode: value.expectedMode as "live" | "demo" }
      : {}),
    ...(value.invitation !== undefined
      ? { invitation: value.invitation as Invitation }
      : {}),
    ...(value.requestImage !== undefined
      ? { requestImage: value.requestImage as boolean }
      : {}),
  };
}

type Bucket = { start: number; count: number };
type ClientBuckets = { chat: Bucket; image: Bucket; seen: number };

// Best effort per-process limits, not distributed quotas. A trusted reverse proxy must
// overwrite X-Forwarded-For. Restarts, multiple workers and LRU eviction reset quotas.
export class RateLimiter {
  private clients = new Map<string, ClientBuckets>();
  constructor(private maxClients = 4096) {}

  get size() {
    return this.clients.size;
  }

  consume(client: string, image: boolean, now = Date.now()): void {
    for (const [key, entry] of this.clients) {
      if (now - entry.seen >= 600_000) this.clients.delete(key);
    }
    let entry = this.clients.get(client);
    if (!entry) {
      if (this.clients.size >= this.maxClients) {
        const oldest = this.clients.keys().next().value;
        if (oldest !== undefined) this.clients.delete(oldest);
      }
      entry = {
        chat: { start: now, count: 0 },
        image: { start: now, count: 0 },
        seen: now,
      };
    }
    if (now - entry.chat.start >= 60_000) entry.chat = { start: now, count: 0 };
    if (now - entry.image.start >= 600_000)
      entry.image = { start: now, count: 0 };
    entry.seen = now;
    this.clients.delete(client);
    this.clients.set(client, entry);
    if (entry.chat.count >= 20) {
      throw new ChatError(
        429,
        "Слишком много реплик. Подождите немного перед следующим сообщением.",
        Math.max(1, Math.ceil((entry.chat.start + 60_000 - now) / 1000)),
      );
    }
    if (image && entry.image.count >= 3) {
      throw new ChatError(
        429,
        "Лимит изображений: три попытки за десять минут. Вернитесь чуть позже.",
        Math.max(1, Math.ceil((entry.image.start + 600_000 - now) / 1000)),
      );
    }
    entry.chat.count++;
    if (image) entry.image.count++;
  }
}

export function demoReply(input: ChatInput): ChatResult {
  if (boundaryReply(input) || identityQuestion(input.messages.at(-1)!.content))
    return { text: scriptedText(input), mode: "demo" };
  if (imageIntent(input)) {
    if (customPortraitRequested(input))
      return {
        text: "Такого кадра в моём архиве пока нет. Могу показать обычный портрет.",
        mode: "demo",
      };
    return {
      text:
        chooseMedia(input) === "portrait"
          ? "Столько любопытства. Хорошо, взгляни. Только не отвлекайся от разговора надолго."
          : "Здесь обычно тише. Думаю, тебе понравится.",
      image: CHAT_MEDIA[chooseMedia(input)],
      mode: "demo",
    };
  }
  return { text: scriptedText(input), mode: "demo" };
}

function config(env: Environment) {
  const key = env.OPENAI_API_KEY?.trim();
  return {
    key,
    model: env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
    images: Boolean(key && env.ENABLE_IMAGE_GENERATION === "true"),
  };
}

async function readJson(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
  tooLarge: ChatError,
  malformed: ChatError,
): Promise<unknown> {
  if (!body) throw malformed;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge;
      }
      chunks.push(chunk.value);
    }
    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(merged),
      );
    } catch {
      throw malformed;
    }
  } catch (error) {
    if (error instanceof ChatError || signal.aborted) throw error;
    throw malformed;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

async function withTimeout<T>(
  parent: AbortSignal,
  milliseconds: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  if (parent.aborted) controller.abort();
  const timer = setTimeout(abort, milliseconds);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ChatError(
        parent.aborted ? 408 : 504,
        parent.aborted
          ? "Запрос прерван. Попробуйте ещё раз."
          : "Время ожидания истекло. Попробуйте ещё раз.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  }
}

type Fetch = typeof globalThis.fetch;
async function providerJson(
  path: "chat/completions" | "images/generations",
  payload: unknown,
  key: string,
  fetcher: Fetch,
  parent: AbortSignal,
): Promise<unknown> {
  const image = path === "images/generations";
  return withTimeout(
    parent,
    image ? LIMITS.imageTimeoutMs : LIMITS.chatTimeoutMs,
    async (signal) => {
      let response: Response;
      try {
        response = await fetcher(`https://api.openai.com/v1/${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(payload),
          signal,
          cache: "no-store",
          redirect: "error",
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ChatError(
          502,
          "Не удалось связаться с сервисом ИИ. Попробуйте позже.",
        );
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        if (response.status === 429)
          throw new ChatError(
            429,
            "Сервис ИИ временно ограничил запросы. Попробуйте позже.",
            60,
          );
        if (response.status === 401 || response.status === 403)
          throw new ChatError(
            503,
            "Сервис ИИ не настроен или недоступен. Обратитесь к владельцу сайта.",
          );
        if (image && response.status === 400)
          throw new ChatError(
            422,
            "Не удалось создать изображение: сервис отклонил запрос. Попробуйте текстовый разговор.",
          );
        throw new ChatError(
          502,
          image
            ? "Сервис не смог создать изображение. Попробуйте позже."
            : "Сервис ИИ не смог ответить. Попробуйте позже.",
        );
      }
      return readJson(
        response.body,
        image ? LIMITS.providerImageBytes : LIMITS.providerTextBytes,
        signal,
        new ChatError(502, "Ответ сервиса превышает допустимый размер."),
        new ChatError(
          502,
          "Сервис вернул некорректный ответ. Попробуйте ещё раз.",
        ),
      );
    },
  );
}

function validPng(buffer: Buffer): boolean {
  if (
    buffer.length < 57 ||
    !buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return false;
  if (
    buffer.readUInt32BE(8) !== 13 ||
    buffer.subarray(12, 16).toString("ascii") !== "IHDR" ||
    buffer.readUInt32BE(16) !== 1024 ||
    buffer.readUInt32BE(20) !== 1024
  )
    return false;
  let hasImageData = false;
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) return false;
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT" && length > 0) hasImageData = true;
    if (type === "IEND")
      return length === 0 && end === buffer.length && hasImageData;
    offset = end;
  }
  return false;
}

export async function liveReply(
  input: ChatInput,
  settings: ReturnType<typeof config>,
  fetcher: Fetch,
  signal: AbortSignal,
): Promise<ChatResult> {
  if (!settings.key) throw new ChatError(503, "Сервис ИИ не настроен.");
  const boundary = boundaryReply(input);
  if (boundary) return { text: boundary, mode: "live" };
  const wantsImage =
    imageIntent(input) && !identityQuestion(input.messages.at(-1)!.content);
  if (wantsImage && !settings.images && customPortraitRequested(input))
    return {
      text: "Такого кадра в моём архиве пока нет. Могу показать обычный портрет.",
      mode: "live",
    };
  const data = await providerJson(
    "chat/completions",
    {
      model: settings.model,
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}\nСтиль: ${STYLE_DIRECTIONS[input.style || "natural"]}\nНачальная тема: ${input.invitation || "свободный разговор"}. Запрошено изображение: ${wantsImage ? "да" : "нет"}.`,
        },
        ...input.messages,
      ],
      max_completion_tokens: 1400,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "geto_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              text: { type: "string" },
              image: {
                type: ["string", "null"],
                enum: ["portrait", "shrine", "spirit", null],
              },
            },
            required: ["text", "image"],
            additionalProperties: false,
          },
        },
      },
    },
    settings.key,
    fetcher,
    signal,
  );
  const choice =
    record(data) && Array.isArray(data.choices) ? data.choices[0] : undefined;
  if (
    !record(choice) ||
    choice.finish_reason !== "stop" ||
    !record(choice.message) ||
    typeof choice.message.content !== "string" ||
    choice.message.refusal
  ) {
    throw new ChatError(
      502,
      "Сервис не прислал полный ответ. Попробуйте переформулировать сообщение.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(choice.message.content);
  } catch {
    throw new ChatError(502, "Сервис вернул некорректный формат ответа.");
  }
  if (
    !record(parsed) ||
    typeof parsed.text !== "string" ||
    !parsed.text.trim() ||
    parsed.text.length > LIMITS.messageCharacters ||
    !(
      parsed.image === null ||
      (typeof parsed.image === "string" &&
        Object.hasOwn(CHAT_MEDIA, parsed.image))
    ) ||
    Object.keys(parsed).some((key) => key !== "text" && key !== "image")
  ) {
    throw new ChatError(502, "Сервис вернул некорректный формат ответа.");
  }
  let image: ChatImage | undefined;
  const text = parsed.text.trim();
  if (wantsImage && parsed.image !== null && settings.images) {
    const theme = chooseMedia(input);
    const generated = await providerJson(
      "images/generations",
      {
        model: "gpt-image-1",
        prompt: `High-quality atmospheric anime portrait of adult Suguru Geto, age 27, long black hair half tied in a bun, cinematic violet and amber light. ${portraitDirection(input)} ${theme === "shrine" ? "A quiet Japanese shrine at dusk behind him." : theme === "spirit" ? "Abstract violet cursed spirit energy swirling behind him." : "Elegant dark background with drifting incense."} Nonsexual, adult only, no genital nudity, no erotic framing, no gore, no hateful imagery, no text or watermark. Unofficial fan art.`,
        n: 1,
        size: "1024x1024",
        quality: "low",
        output_format: "png",
      },
      settings.key,
      fetcher,
      signal,
    );
    const first =
      record(generated) &&
      Array.isArray(generated.data) &&
      generated.data.length === 1
        ? generated.data[0]
        : undefined;
    const base64 = record(first) ? first.b64_json : undefined;
    if (
      typeof base64 !== "string" ||
      base64.length > LIMITS.imageBase64Characters ||
      base64.length < 32 ||
      base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
    ) {
      throw new ChatError(502, "Сервис вернул некорректное изображение.");
    }
    const decoded = Buffer.from(base64, "base64");
    if (!validPng(decoded)) {
      throw new ChatError(
        502,
        "Сервис вернул изображение неподдерживаемого формата.",
      );
    }
    image = {
      src: `data:image/png;base64,${base64}`,
      alt: "Сугуру Гето · авторская иллюстрация",
    };
  } else if (wantsImage && parsed.image !== null) {
    image = CHAT_MEDIA[chooseMedia(input)];
  }
  if (text.length > LIMITS.messageCharacters)
    throw new ChatError(
      502,
      "Ответ слишком длинный. Попробуйте переформулировать сообщение.",
    );
  return { text, ...(image ? { image } : {}), mode: "live" };
}

function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const publicHost = request.headers.get("host") || new URL(request.url).host;
  let originAllowed = origin === null;
  if (origin) {
    try {
      const parsed = new URL(origin);
      // The framework can normalize request.url to its internal listen address.
      // Host remains the browser-facing authority and must be preserved by the proxy.
      originAllowed =
        ["http:", "https:"].includes(parsed.protocol) &&
        parsed.host === publicHost &&
        parsed.origin === origin;
    } catch {
      originAllowed = false;
    }
  }
  if (
    !originAllowed ||
    (site !== null && site !== "same-origin" && site !== "none")
  ) {
    throw new ChatError(403, "Запрос разрешён только с этого сайта.");
  }
}

function json(value: unknown, status = 200, retryAfter?: number): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(retryAfter !== undefined
        ? { "Retry-After": String(retryAfter) }
        : {}),
    },
  });
}

export function createChatHandlers(
  dependencies: {
    env?: Environment;
    fetch?: Fetch;
    limiter?: RateLimiter;
    now?: () => number;
  } = {},
) {
  const limiter = dependencies.limiter || new RateLimiter();
  return {
    GET: async (): Promise<Response> => {
      const settings = config(dependencies.env || process.env);
      return json({
        mode: settings.key ? "live" : "demo",
        imageGeneration: settings.images,
      });
    },
    POST: async (request: Request): Promise<Response> => {
      try {
        sameOrigin(request);
        if (
          request.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() !== "application/json"
        ) {
          throw new ChatError(
            415,
            "Отправьте запрос в формате application/json.",
          );
        }
        const length = request.headers.get("content-length");
        if (
          length !== null &&
          (!/^\d+$/.test(length) || Number(length) > LIMITS.requestBytes)
        ) {
          throw new ChatError(413, "Запрос слишком большой.");
        }
        const body = await withTimeout(
          request.signal,
          LIMITS.bodyTimeoutMs,
          (signal) =>
            readJson(
              request.body,
              LIMITS.requestBytes,
              signal,
              new ChatError(413, "Запрос слишком большой."),
              new ChatError(400, "Не удалось прочитать JSON запроса."),
            ),
        );
        const input = validateChatInput(body);
        const settings = config(dependencies.env || process.env);
        if (
          input.expectedMode &&
          input.expectedMode !== (settings.key ? "live" : "demo")
        ) {
          throw new ChatError(
            409,
            "Формат чата изменился. Скопируй свой черновик и обнови страницу, чтобы посмотреть новые условия в «О чате».",
          );
        }
        const client = (
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          "unknown"
        ).slice(0, 128);
        limiter.consume(
          client,
          settings.images && imageIntent(input),
          dependencies.now?.() ?? Date.now(),
        );
        const result = settings.key
          ? await liveReply(
              input,
              settings,
              dependencies.fetch || globalThis.fetch,
              request.signal,
            )
          : demoReply(input);
        return json(result);
      } catch (error) {
        if (error instanceof ChatError)
          return json({ error: error.message }, error.status, error.retryAfter);
        // Provider payloads and exceptions can contain credentials or private conversation text.
        return json(
          { error: "Не удалось обработать запрос. Попробуйте ещё раз." },
          500,
        );
      }
    },
  };
}
