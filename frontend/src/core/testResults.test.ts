import { expect, test, vi } from "vitest";
import { TestResults } from "./testResults";

test("set replaces a file's results, get reads them by name, clear drops them", () => {
  const r = new TestResults();
  expect(r.get("a_test.go")).toBeUndefined();
  r.set("a_test.go", [{ name: "TestA", status: "pass" }], 5);
  r.set("a_test.go", [{ name: "TestB", status: "fail" }], 7);
  const got = r.get("a_test.go");
  expect(got?.at).toBe(7);
  expect([...got!.byName.keys()]).toEqual(["TestB"]);
  r.clear("a_test.go");
  expect(r.get("a_test.go")).toBeUndefined();
});

test("a failure wins when a name is reported twice", () => {
  const r = new TestResults();
  r.set(
    "a_test.go",
    [
      { name: "TestA", status: "fail", pkg: "x/one" },
      { name: "TestA", status: "pass", pkg: "x/two" },
    ],
    1,
  );
  expect(r.get("a_test.go")?.byName.get("TestA")?.status).toBe("fail");
});

test("subscribers hear set and clear, not a clear of nothing, and can leave", () => {
  const r = new TestResults();
  const fn = vi.fn();
  const off = r.subscribe(fn);
  r.set("a", [], 1);
  r.clear("a");
  r.clear("a");
  expect(fn).toHaveBeenCalledTimes(2);
  off();
  r.set("a", [], 2);
  expect(fn).toHaveBeenCalledTimes(2);
});
