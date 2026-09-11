import assert from "node:assert/strict";
import { test } from "node:test";
import { createChatHandlers, validateChatInput } from "./server-chat";

const input = { messages: [{ role: "user", content: "Привет" }] };

test("validates optional client-confirmed processing mode", () => {
  for (const expectedMode of ["demo", "live"])
    assert.equal(
      validateChatInput({ ...input, expectedMode }).expectedMode,
      expectedMode,
    );
  for (const expectedMode of [null, false, "offline", "loading", {}])
    assert.throws(() => validateChatInput({ ...input, expectedMode }));
  assert.equal(validateChatInput(input).expectedMode, undefined);
});

test("a mode change cannot send a demo conversation to the provider without renewed disclosure", async () => {
  for (const [key, expectedMode] of [
    ["test-only", "demo"],
    ["", "live"],
  ]) {
    let calls = 0;
    const api = createChatHandlers({
      env: { OPENAI_API_KEY: key },
      fetch: async () => {
        calls++;
        throw new Error("Must not send conversation to provider");
      },
    });
    const response = await api.POST(
      new Request("https://geto.example/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, expectedMode }),
      }),
    );
    assert.equal(response.status, 409);
    assert.equal(calls, 0);
    assert.match((await response.json()).error, /Формат чата изменился/);
  }
});
