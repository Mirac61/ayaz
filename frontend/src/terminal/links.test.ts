import { expect, test } from "vitest";
import { fileLinks, resolveLink } from "./links";

test("path:line and path:line:col become links with their range", () => {
  const text = "a.go:3 and src/a.go:3:7 in ./x/y.ts:10, /abs/p.c:1:2";
  expect(fileLinks(text).map((l) => [text.slice(l.start, l.end), l.path, l.line, l.col])).toEqual([
    ["a.go:3", "a.go", 3, undefined],
    ["src/a.go:3:7", "src/a.go", 3, 7],
    ["./x/y.ts:10", "./x/y.ts", 10, undefined],
    ["/abs/p.c:1:2", "/abs/p.c", 1, 2],
  ]);
  expect(fileLinks("vet: src/a.go:3:1: boom")[0]).toMatchObject({ start: 5, end: 17 });
});

test("times, ports, URLs and plain words are no links", () => {
  for (const t of ["12:30:45", "localhost:8080", "https://example.com:443/x", "foo: 3", "at 10:15", "v1.2:3"]) {
    expect(fileLinks(t), t).toEqual([]);
  }
});

test("resolveLink: relative to the shell's folder, absolute inside the root, null outside", () => {
  expect(resolveLink("a.go", "/ws/sub", "/ws")).toBe("sub/a.go");
  expect(resolveLink("./a.go", "", "/ws")).toBe("a.go");
  expect(resolveLink("../a.go", "/ws/sub", "/ws")).toBe("a.go");
  expect(resolveLink("/ws/src/a.go", "/ws/sub", "/ws")).toBe("src/a.go");
  expect(resolveLink("/etc/hosts", "", "/ws")).toBeNull();
  expect(resolveLink("../x.go", "", "/ws")).toBeNull();
  expect(resolveLink("../../x.go", "/ws/sub", "/ws")).toBeNull();
  expect(resolveLink("/ws2/a.go", "", "/ws")).toBeNull(); // a sibling with the same prefix
  expect(resolveLink("/ws", "", "/ws")).toBeNull();
});
