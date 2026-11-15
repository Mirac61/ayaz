import { expect, it } from "vitest";
import { MAX_STARS, stars } from "./constellation";

it("gives the newest folder the brightest, biggest star and stops after nine", () => {
  const s = stars(12);
  expect(s).toHaveLength(MAX_STARS);
  expect(s[0].size).toBeGreaterThan(s[8].size);
  expect(s[0].opacity).toBeGreaterThan(s[8].opacity);
  expect(stars(0)).toEqual([]);
  expect(new Set(s.map((x) => `${x.x},${x.y}`)).size).toBe(MAX_STARS);
});
