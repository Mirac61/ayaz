import { beforeEach, expect, test } from "vitest";
import type { PickerSource } from "./Picker";
import { forget, remember, resumed } from "./resume";

const src = (title: string, resumable?: boolean): PickerSource => ({ title, resumable, query: async () => [], pick() {} });

beforeEach(forget);

test("sources that are not resumable are ignored", () => {
  remember(src("Rename", false), "x");
  remember(src("Commands"), "y");
  expect(resumed()).toBeNull();
});

test("resumed gives a new source with the last typed text; the later source wins", () => {
  const a = src("Files", true),
    b = src("Search", true);
  remember(a, "ma");
  remember(a, "main");
  expect(resumed()).toMatchObject({ title: "Files", initial: "main" });
  expect(resumed()).not.toBe(a);
  remember(b, "func");
  remember(src("Rename", false), "z"); // a prompt in between does not replace it
  expect(resumed()).toMatchObject({ title: "Search", initial: "func" });
});

test("forget drops it", () => {
  remember(src("Files", true), "a");
  forget();
  expect(resumed()).toBeNull();
});
