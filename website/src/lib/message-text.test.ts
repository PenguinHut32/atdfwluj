import assert from "node:assert/strict";
import test from "node:test";
import { messageTextParts } from "./message-text";

test("renders single-star actions while preserving newlines", () => {
  assert.deepEqual(messageTextParts("Привет. *Улыбается*\nСадись."), [
    { text: "Привет. ", action: false, highlighted: false },
    { text: "Улыбается", action: true, highlighted: false },
    { text: "\nСадись.", action: false, highlighted: false },
  ]);
});

test("highlights Russian search inside actions without losing emphasis", () => {
  const parts = messageTextParts("*Тихо смеётся*", "СМЕЁТСЯ");
  assert.deepEqual(parts, [
    { text: "Тихо ", action: true, highlighted: false },
    { text: "смеётся", action: true, highlighted: true },
  ]);
});

test("preserves unmatched stars, unsupported markdown and HTML as text", () => {
  for (const text of [
    "*не завершено",
    "**жирный**",
    "* *",
    '<script>alert("x")</script>',
  ]) {
    assert.deepEqual(messageTextParts(text), [
      { text, action: false, highlighted: false },
    ]);
  }
});

test("supports multiple and multiline actions and empty input", () => {
  const parts = messageTextParts("*смотрит* и *делает\nпаузу*");
  assert.equal(
    parts.map((part) => part.text).join(""),
    "смотрит и делает\nпаузу",
  );
  assert.equal(parts.filter((part) => part.action).length, 2);
  assert.deepEqual(messageTextParts(""), []);
});

test("search can cross action boundaries and highlights only first match", () => {
  const parts = messageTextParts("да *да* да", "да *да*");
  assert.equal(
    parts
      .filter((part) => part.highlighted)
      .map((part) => part.text)
      .join(""),
    "да да",
  );
  assert.equal(
    messageTextParts("да да", "да").filter((part) => part.highlighted).length,
    1,
  );
});
