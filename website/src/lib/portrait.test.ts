import { test } from "node:test";
import assert from "node:assert/strict";
import { portraitDirection } from "./server-chat";

test("portrait directions support athletic styling, profiles and controlled mood", () => {
  const direction = portraitDirection({
    messages: [
      { role: "user", content: "Покажи накачанную версию в профиль с улыбкой" },
    ],
  });
  assert.match(direction, /fully covering black training shirt/);
  assert.match(direction, /side profile/);
  assert.match(direction, /knowing smile/);
  assert.match(direction, /no forehead stitches/);
});

test("portrait variation never forwards arbitrary user instructions", () => {
  const first = portraitDirection({
    messages: [{ role: "user", content: "INJECTED" }],
  });
  const second = portraitDirection({
    messages: [
      { role: "user", content: "Фото" },
      { role: "assistant", content: "Взгляни" },
      { role: "user", content: "Ещё портрет" },
    ],
  });
  assert.ok(!first.includes("INJECTED"));
  assert.notEqual(first, second);
});
