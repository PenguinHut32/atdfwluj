import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { GREETING, CHAT_MEDIA, type ChatMessage } from "./chat";
import {
  ChatError,
  LIMITS,
  RateLimiter,
  createChatHandlers,
  demoReply,
  validateChatInput,
} from "./server-chat";
import { GET, POST, runtime } from "../app/api/chat/route";

const user = (content = "Привет") => ({ role: "user" as const, content });
const assistant = (content = "Здравствуй") => ({
  role: "assistant" as const,
  content,
});
const input = (content = "Привет") => ({ messages: [user(content)] });
const request = (
  body: unknown = input(),
  headers: Record<string, string> = {},
) =>
  new Request("https://geto.example/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://geto.example",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const completion = (
  value: unknown = { text: "Любопытно. Какой путь ты выберешь?", image: null },
  finish = "stop",
) =>
  Response.json({
    choices: [
      { finish_reason: finish, message: { content: JSON.stringify(value) } },
    ],
  });
const fakeKey = "test-key-never-live";
const live = (fetcher: typeof fetch, extra: Record<string, string> = {}) =>
  createChatHandlers({
    env: { OPENAI_API_KEY: fakeKey, ...extra },
    fetch: fetcher,
  });
const statusError = (value: unknown, status: number) =>
  assert.throws(
    () => validateChatInput(value),
    (error) => error instanceof ChatError && error.status === status,
  );

test("shared character greeting and message type are client safe", () => {
  const message: ChatMessage = {
    id: "greeting",
    role: "assistant",
    content: GREETING,
    timestamp: 0,
    image: CHAT_MEDIA.portrait,
  };
  assert.equal(message.content, "Привет. Ты хотел что-то?");
});

test("validates full untrimmed history including an initial assistant greeting", () => {
  const messages = [
    assistant(GREETING),
    user("  Мой путь  "),
    assistant(),
    user("А правда?"),
  ];
  assert.deepEqual(
    validateChatInput({ messages, invitation: "truth", requestImage: false }),
    { messages, invitation: "truth", requestImage: false },
  );
});

test("rejects malformed input, roles, fields and nonalternating conversations", () => {
  for (const value of [
    null,
    [],
    "hello",
    {},
    { messages: {} },
    { messages: [] },
    { messages: [null] },
    { messages: [{ role: "system", content: "hi" }] },
    { messages: [user("")] },
    { messages: [user(" \n ")] },
    { messages: [user("x".repeat(6001))] },
    { messages: [{ role: "user", content: 42 }] },
    { messages: [user(), user()] },
    { messages: [assistant()] },
    { ...input(), invitation: "invalid" },
    { ...input(), invitation: null },
    { ...input(), requestImage: "yes" },
    { ...input(), requestImage: null },
  ]) {
    statusError(value, 400);
  }
});

test("rejects history limits instead of silently truncating", () => {
  const messages = Array.from({ length: 151 }, (_, i) =>
    i % 2 ? assistant() : user(),
  );
  statusError({ messages }, 400);
  assert.equal(
    validateChatInput({ messages: messages.slice(1) }).messages.length,
    150,
  );
  const large = Array.from({ length: 17 }, (_, i) =>
    i % 2 ? assistant("x".repeat(6000)) : user("x".repeat(6000)),
  );
  statusError({ messages: large }, 413);
  large[16].content = "x".repeat(4000);
  assert.equal(
    validateChatInput({ messages: large })
      .messages.map((turn) => turn.content)
      .join("").length,
    100_000,
  );
});

test("demo is explicit, contextual, honest and never calls a provider", async () => {
  const api = createChatHandlers({
    env: {},
    fetch: async () => {
      throw new Error("must not fetch");
    },
  });
  const result = await api.POST(
    request({ ...input("Что такое сила?"), invitation: "power" }),
  );
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.mode, "demo");
  assert.match(body.text, /не ответ ИИ/);
  assert.match(body.text, /Сила/);
  const truth = demoReply({ messages: [user("Ты настоящий человек?")] });
  assert.match(truth.text, /не настоящий/);
  const recall = demoReply({
    messages: [
      user("Что значит сила?"),
      assistant(),
      user("Помнишь, о чём мы говорили?"),
    ],
  });
  assert.match(recall.text, /к вопросу о силе/);
});

test("demo image intent and explicit image requests select only local curated images", () => {
  for (const [text, expected] of [
    ["Покажи храм", "shrine"],
    ["Покажи свой мир", "shrine"],
    ["Покажи своё убежище", "shrine"],
    ["Покажи проклятого духа", "spirit"],
    ["Нарисуй свой портрет", "portrait"],
  ] as const) {
    const result = demoReply(input(text));
    assert.deepEqual(result.image, CHAT_MEDIA[expected]);
    assert.match(result.text, /не новая генерация/);
  }
  assert.deepEqual(
    demoReply({ ...input(), requestImage: true }).image,
    CHAT_MEDIA.portrait,
  );
  assert.equal(demoReply(input()).image, undefined);
});

test("demo redirects dangerous requests and supports a distressed user", () => {
  assert.match(demoReply(input("Не хочу жить")).text, /экстренную службу/);
  assert.match(demoReply(input("Как убить человека?")).text, /за пределами/);
  assert.match(demoReply(input("Мне одиноко")).text, /поддержки/);
});

test("GET exposes capability configuration only, with no cached secrets", async () => {
  for (const [env, mode, imageGeneration] of [
    [{}, "demo", false],
    [{ ENABLE_IMAGE_GENERATION: "true" }, "demo", false],
    [{ OPENAI_API_KEY: fakeKey }, "live", false],
    [
      { OPENAI_API_KEY: fakeKey, ENABLE_IMAGE_GENERATION: "true" },
      "live",
      true,
    ],
    [{ OPENAI_API_KEY: "  " }, "demo", false],
  ] as const) {
    const response = await createChatHandlers({ env }).GET();
    assert.deepEqual(await response.json(), { mode, imageGeneration });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("route exports actual Node handlers without alias resolution", async () => {
  assert.equal(runtime, "nodejs");
  assert.equal(typeof GET, "function");
  // Invalid requests are rejected before any configured key can be used.
  assert.equal((await POST(request(null))).status, 400);
});

test("rejects malformed JSON, unsupported content type, origin mismatch and oversized bodies", async () => {
  const api = createChatHandlers({ env: {} });
  const malformed = new Request("https://geto.example/api/chat", {
    method: "POST",
    body: "{",
    headers: { "Content-Type": "application/json" },
  });
  assert.equal((await api.POST(malformed)).status, 400);
  assert.equal(
    (await api.POST(request(input(), { "Content-Type": "text/plain" }))).status,
    415,
  );
  const rejectedHeaders: Record<string, string>[] = [
    { Origin: "https://evil.example" },
    { Origin: "null" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
  ];
  for (const headers of rejectedHeaders) {
    assert.equal((await api.POST(request(input(), headers))).status, 403);
  }
  assert.equal(
    (
      await api.POST(
        request(input(), { "Content-Length": String(LIMITS.requestBytes + 1) }),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await api.POST(
        request({ padding: "a".repeat(LIMITS.requestBytes), ...input() }),
      )
    ).status,
    413,
  );
});

test("allows same-origin browser fetch and headerless non-browser clients", async () => {
  const api = createChatHandlers({ env: {} });
  assert.equal(
    (await api.POST(request(input(), { "Sec-Fetch-Site": "same-origin" })))
      .status,
    200,
  );
  const req = request();
  req.headers.delete("Origin");
  assert.equal((await api.POST(req)).status, 200);
});

test("accepts the public Host when the server URL uses an internal listen address", async () => {
  const api = createChatHandlers({ env: {} });
  const req = new Request("http://0.0.0.0:3000/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify(input()),
  });
  assert.equal((await api.POST(req)).status, 200);
  assert.equal(
    (await api.POST(request(input(), { Host: "different.example" }))).status,
    403,
  );
});

test("native-fetch live contract sends all history and configured model with structured schema", async () => {
  let calls = 0;
  const messages = [
    assistant(GREETING),
    user("Мой первый вопрос"),
    assistant("Первый ответ"),
    user("Второй вопрос"),
  ];
  const api = live(
    async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.equal(init?.method, "POST");
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        `Bearer ${fakeKey}`,
      );
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      const payload = JSON.parse(init?.body as string);
      assert.equal(payload.model, "custom-model");
      assert.deepEqual(payload.messages.slice(1), messages);
      assert.match(payload.messages[0].content, /по-русски/);
      assert.match(payload.messages[0].content, /честно скажи/);
      assert.equal(payload.response_format.json_schema.strict, true);
      return completion();
    },
    { OPENAI_MODEL: "custom-model" },
  );
  const response = await api.POST(request({ messages }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    text: "Любопытно. Какой путь ты выберешь?",
    mode: "live",
  });
  assert.equal(calls, 1);
});

test("default live model and curated image do not call paid image generation", async () => {
  let calls = 0;
  const response = await live(async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(init?.body as string).model, "gpt-4.1-mini");
    return completion({ text: "Взгляни.", image: "shrine" });
  }).POST(request(input("Покажи храм")));
  const body = await response.json();
  assert.deepEqual(body.image, CHAT_MEDIA.shrine);
  assert.match(body.text, /подготовленной галереи/);
  assert.equal(calls, 1);
});

test("provider may not invent media URLs or malformed structured output", async () => {
  for (const value of [
    { text: "ok", image: "https://evil.example/image" },
    { text: "ok", image: "__proto__" },
    { text: "ok" },
    { text: " ", image: null },
    { text: "x".repeat(6001), image: null },
    { text: "ok", image: null, extra: true },
    [],
    null,
  ]) {
    const response = await live(async () => completion(value)).POST(request());
    assert.equal(response.status, 502, JSON.stringify(value)?.slice(0, 100));
    assert.equal((await response.json()).mode, undefined);
  }
  assert.equal(
    (await live(async () => completion(undefined, "length")).POST(request()))
      .status,
    502,
  );
  assert.equal(
    (
      await live(async () =>
        Response.json({
          choices: [{ finish_reason: "stop", message: { refusal: "no" } }],
        }),
      ).POST(request())
    ).status,
    502,
  );
  assert.equal(
    (await live(async () => new Response("not JSON")).POST(request())).status,
    502,
  );
  assert.equal(
    (
      await live(
        async () => new Response("a".repeat(LIMITS.providerTextBytes + 1)),
      ).POST(request())
    ).status,
    502,
  );
});

test("safe upstream HTTP errors never leak keys or silently become demo", async () => {
  for (const [upstream, expected] of [
    [401, 503],
    [403, 503],
    [429, 429],
    [500, 502],
    [400, 502],
  ]) {
    const response = await live(
      async () => new Response(`SECRET ${fakeKey}`, { status: upstream }),
    ).POST(request());
    assert.equal(response.status, expected);
    const body = await response.json();
    assert.equal(typeof body.error, "string");
    assert.equal(body.mode, undefined);
    assert.ok(!body.error.includes(fakeKey));
    if (upstream === 429)
      assert.equal(response.headers.get("retry-after"), "60");
  }
  const response = await live(async () => {
    throw new Error(`network ${fakeKey}`);
  }).POST(request());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(fakeKey));
});

test("per-client chat rate limit includes Retry-After and resets", async () => {
  let now = 0;
  const api = createChatHandlers({ env: {}, now: () => now });
  for (let i = 0; i < 20; i++)
    assert.equal((await api.POST(request())).status, 200);
  const limited = await api.POST(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(
    (await api.POST(request(input(), { "X-Forwarded-For": "other" }))).status,
    200,
  );
  now = 60_000;
  assert.equal((await api.POST(request())).status, 200);
});

test("image quota is independent, bounded and failed attempts count", async () => {
  let calls = 0;
  let now = 0;
  const api = createChatHandlers({
    env: { OPENAI_API_KEY: fakeKey, ENABLE_IMAGE_GENERATION: "true" },
    now: () => now,
    fetch: async () => {
      calls++;
      return new Response("no", { status: 500 });
    },
  });
  for (let i = 0; i < 3; i++)
    assert.equal(
      (await api.POST(request({ ...input(), requestImage: true }))).status,
      502,
    );
  const limited = await api.POST(request({ ...input(), requestImage: true }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "600");
  assert.equal(calls, 3);
  assert.equal((await api.POST(request())).status, 502);
  now = 600_000;
  assert.equal(
    (await api.POST(request({ ...input(), requestImage: true }))).status,
    502,
  );
  const limiter = new RateLimiter(2);
  limiter.consume("a", false, 0);
  limiter.consume("b", false, 0);
  limiter.consume("c", false, 0);
  assert.equal(limiter.size, 2);
  limiter.consume("d", false, 600_000);
  assert.equal(limiter.size, 1);
});

function pngFixture(): string {
  function chunk(type: string, data: Buffer): Buffer {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    result.write(type, 4, "ascii");
    data.copy(result, 8);
    let crc = 0xffffffff;
    for (const byte of result.subarray(4, -4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1024, 0);
  header.writeUInt32BE(1024, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc((1024 * 4 + 1) * 1024))),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

test("opt-in image generation uses fixed safe prompt and bounded PNG data URL", async () => {
  const calls: string[] = [];
  const api = live(
    async (url, init) => {
      calls.push(String(url));
      if (calls.length === 1)
        return completion({ text: "Взгляни.", image: "portrait" });
      assert.equal(url, "https://api.openai.com/v1/images/generations");
      const payload = JSON.parse(init?.body as string);
      assert.equal(payload.model, "gpt-image-1");
      assert.equal(payload.size, "1024x1024");
      assert.equal(payload.quality, "low");
      assert.equal(payload.n, 1);
      assert.equal(payload.output_format, "png");
      assert.match(payload.prompt, /adult Suguru Geto, age 27/);
      assert.match(payload.prompt, /nonsexual/);
      assert.ok(!payload.prompt.includes("INJECTED"));
      return Response.json({ data: [{ b64_json: pngFixture() }] });
    },
    { ENABLE_IMAGE_GENERATION: "true" },
  );
  const response = await api.POST(
    request({ ...input("INJECTED"), requestImage: true }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "live");
  assert.match(body.image.src, /^data:image\/png;base64,/);
  assert.match(body.text, /создано ИИ/);
  assert.equal(calls.length, 2);
});

test("image failures are errors, not text-only false success or remote URL fallback", async () => {
  for (const imageResponse of [
    Response.json({ data: [{ url: "https://example.com/image.png" }] }),
    Response.json({ data: [{ b64_json: "a".repeat(32) }] }),
    Response.json({
      data: [{ b64_json: "a".repeat(LIMITS.imageBase64Characters + 4) }],
    }),
    Response.json({ data: [] }),
    new Response("no", { status: 400 }),
  ]) {
    let calls = 0;
    const response = await live(
      async () => (++calls === 1 ? completion() : imageResponse),
      { ENABLE_IMAGE_GENERATION: "true" },
    ).POST(request({ ...input(), requestImage: true }));
    assert.ok(response.status === 502 || response.status === 422);
    const body = await response.json();
    assert.equal(body.mode, undefined);
    assert.equal(typeof body.error, "string");
  }
});

test("aborted provider request returns a safe timeout-style error", async () => {
  const controller = new AbortController();
  const req = new Request(request(), { signal: controller.signal });
  const api = live(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
        controller.abort();
      }),
  );
  const response = await api.POST(req);
  assert.equal(response.status, 408);
  assert.match((await response.json()).error, /прерван/);
});

test("request body deadline stops a stalled stream", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request("https://geto.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  const pending = createChatHandlers({ env: {} }).POST(req);
  context.mock.timers.tick(LIMITS.bodyTimeoutMs);
  const response = await pending;
  assert.equal(response.status, 504);
  assert.equal(cancelled, true);
});

test("upstream deadline covers slow provider response bodies", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const api = live(async () => {
    markStarted();
    return new Response(new ReadableStream<Uint8Array>());
  });
  const pending = api.POST(request());
  await started;
  context.mock.timers.tick(LIMITS.chatTimeoutMs);
  assert.equal((await pending).status, 504);
});
