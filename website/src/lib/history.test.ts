import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHistory, serializeHistory } from "./history";
import { GREETING, type ChatMessage } from "./chat";

const hello: ChatMessage = {
  id: "hello",
  role: "assistant",
  content: GREETING,
  timestamp: 1000,
};
test("history preserves complete alternating conversation and curated media", () => {
  const messages: ChatMessage[] = [
    hello,
    { id: "user", role: "user", content: "Покажи храм", timestamp: 2000 },
    {
      id: "reply",
      role: "assistant",
      content: "Взгляни",
      timestamp: 3000,
      image: { src: "/images/shrine.svg", alt: "Храм" },
    },
  ];
  assert.deepEqual(parseHistory(serializeHistory(messages)), messages);
});
test("history rejects malformed, incomplete, duplicated and invalid date records", () => {
  for (const value of [
    null,
    "{",
    "[]",
    "{}",
    JSON.stringify([{ ...hello, role: "system" }]),
    JSON.stringify([{ ...hello, timestamp: 1e30 }]),
    JSON.stringify([{ ...hello, content: "" }]),
    JSON.stringify([hello, hello]),
    JSON.stringify([{ ...hello, role: "user" }]),
  ])
    assert.equal(parseHistory(value), null);
});
test("history excludes unsafe and generated media without dropping text", () => {
  const generated = {
    ...hello,
    image: { src: "data:image/png;base64,example", alt: "Генерация" },
  };
  assert.deepEqual(parseHistory(serializeHistory([generated])), [hello]);
  assert.deepEqual(
    parseHistory(
      JSON.stringify([
        {
          ...hello,
          image: { src: "https://external.invalid/image", alt: "remote" },
        },
      ]),
    ),
    [hello],
  );
});
