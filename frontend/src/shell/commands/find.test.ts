import { expect, test } from "vitest";
import type { Files } from "../../core/backend";
import type { PickerSource } from "../Picker";
import type { Ctx } from "./context";
import { findCommands } from "./find";
import { forget, remember } from "../resume";
import type { QuickfixTools } from "./quickfix";

function setup() {
  forget();
  const fails: string[] = [];
  const greps: { query: string; regex: boolean }[] = [];
  const pickers: PickerSource[] = [];
  const files = {
    grep: (query: string, o: { regex: boolean }) => {
      greps.push({ query, regex: o.regex });
      return { done: Promise.resolve(null), cancel() {} };
    },
  } as unknown as Files;
  const c = { files, ed: {}, qf: {}, run() {}, say() {}, fail: (m: string) => fails.push(m), setPicker: (p: PickerSource | null) => p && pickers.push(p) } as unknown as Ctx;
  const cmds = findCommands(c, {} as QuickfixTools);
  const run = (id: string) => cmds.find((x) => x.id === id)!.run();
  return { greps, pickers, fails, run };
}

test("find.todos opens a regex search that starts at once; find.grep stays literal afterwards", () => {
  const { greps, pickers, run } = setup();
  run("find.todos");
  const todos = pickers[0];
  expect(todos.initial).toBe("\\b(TODO|FIXME|HACK|XXX)\\b");
  void todos.query(todos.initial!, () => {});
  expect(greps).toEqual([{ query: todos.initial, regex: true }]);

  run("find.grep");
  expect(pickers[1].initial).toBeUndefined();
  void pickers[1].query("TODO", () => {});
  expect(greps[1]).toEqual({ query: "TODO", regex: false });
});

test("find.toggleRegex still applies to find.grep and not to find.todos", () => {
  const { greps, pickers, run } = setup();
  run("find.toggleRegex");
  run("find.grep");
  void pickers[0].query("a.b", () => {});
  expect(greps[0].regex).toBe(true);
  run("find.todos");
  void pickers[1].query(pickers[1].initial!, () => {});
  expect(greps[1].regex).toBe(true);
});

test("find.resume reopens the last search with its text and its own regex; with none it says so", () => {
  const { greps, pickers, fails, run } = setup();
  run("find.resume");
  expect(fails).toEqual(["No picker to resume yet"]);
  expect(pickers).toEqual([]);

  run("find.todos");
  remember(pickers[0], "FIXME");
  run("find.toggleRegex"); // toggled off afterwards: the resumed todo search stays a regex
  run("find.toggleRegex");
  run("find.resume");
  expect(pickers[1]).toMatchObject({ title: pickers[0].title, initial: "FIXME" });
  void pickers[1].query("FIXME", () => {});
  expect(greps[0]).toEqual({ query: "FIXME", regex: true });
});
