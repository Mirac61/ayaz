import { expect, test } from "vitest";
import { ago, blameText } from "./blame";

const NOW = 1_800_000_000;

test("ago picks the biggest unit that fits", () => {
  expect(ago(NOW - 5, NOW)).toBe("just now");
  expect(ago(NOW - 60, NOW)).toBe("1 minute ago");
  expect(ago(NOW - 3 * 3600, NOW)).toBe("3 hours ago");
  expect(ago(NOW - 86400 * 2, NOW)).toBe("2 days ago");
  expect(ago(NOW - 86400 * 15, NOW)).toBe("2 weeks ago");
  expect(ago(NOW - 86400 * 400, NOW)).toBe("1 year ago");
  expect(ago(NOW + 100, NOW)).toBe("just now"); // a clock a bit ahead
});

test("the line shows author, age, commit and message; an uncommitted line says so", () => {
  const b = { hash: "a1b2c3d4", author: "Ada", time: NOW - 86400 * 3, summary: "fix the thing", committed: true };
  expect(blameText(b, NOW)).toBe("Ada, 3 days ago • a1b2c3d4 fix the thing");
  expect(blameText({ ...b, hash: "", committed: false }, NOW)).toBe("Not committed yet");
});
