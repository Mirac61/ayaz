import { expect, test } from "vitest";
import { stats } from "./stats";

test("percentiles of 1..100", () => {
  const s = stats(Array.from({ length: 100 }, (_, i) => 100 - i));
  expect(s).toEqual({ p50: 51, p95: 96, max: 100 });
});
