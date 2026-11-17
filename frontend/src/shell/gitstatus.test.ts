import { expect, test, vi } from "vitest";
import { gitMarks, single } from "./gitstatus";

test("own state, strongest state below a folder, inherited from ignored and untracked folders", () => {
  const m = gitMarks({ "a/b/c.go": "M", "a/new.go": "?", "a/x.log": "!", "a/b/d.go": "U", build: "!", fresh: "?", top: "A" });
  expect(m("a/b/c.go")).toBe("M");
  expect(m("a/b")).toBe("U");
  expect(m("a")).toBe("U");
  expect(m("a/x.log")).toBe("!");
  expect(m("build/out/x.o")).toBe("!");
  expect(m("fresh/f.txt")).toBe("?");
  expect(m("top")).toBe("A");
  expect(m("clean.go")).toBeUndefined();
  expect(gitMarks({ "a/x.log": "!" })("a")).toBeUndefined();
});

test("single: calls during a run start one more run afterwards, never two at once", async () => {
  let running = 0,
    max = 0,
    runs = 0;
  const release: (() => void)[] = [];
  const load = single(() => {
    runs++;
    max = Math.max(max, ++running);
    return new Promise<void>((r) =>
      release.push(() => {
        running--;
        r();
      }),
    );
  });
  load();
  load();
  load();
  load();
  expect(runs).toBe(1);
  release.shift()!();
  await vi.waitFor(() => expect(runs).toBe(2));
  release.shift()!();
  await new Promise((r) => setTimeout(r));
  expect(runs).toBe(2);
  expect(max).toBe(1);
});

test("single with a gap: a burst of calls runs at most once per gap", async () => {
  let runs = 0;
  const load = single(async () => void runs++, 50);
  load(); // runs now
  for (let i = 0; i < 5; i++) {
    load(); // all of these ask for one more run
  }
  expect(runs).toBe(1);
  await new Promise((r) => setTimeout(r, 20));
  expect(runs).toBe(1); // still inside the gap
  await vi.waitFor(() => expect(runs).toBe(2));
  await new Promise((r) => setTimeout(r, 80));
  expect(runs).toBe(2);
});
