import { describe, expect, test } from "vitest";
import { Text } from "@codemirror/state";
import { fileOps, fileUri, streamTransport, toChanges, uriPath } from "./lsp";
import { serverFor } from "../lang/registry";

const dec = new TextDecoder();

function fakeSocket(state: number) {
  const sent: string[] = [];
  const sock: any = { readyState: state, send: (b: Uint8Array) => sent.push(dec.decode(b)), close() {} };
  return { sock, sent };
}

describe("streamTransport", () => {
  test("queues until open, then sends hello first", () => {
    const { sock, sent } = fakeSocket(0);
    const t = streamTransport(sock, { ws: "w", lang: "go" }, () => {});
    t.send("a");
    t.send("b");
    expect(sent).toEqual([]);
    sock.readyState = 1;
    sock.onopen();
    expect(sent).toEqual(['{"ws":"w","lang":"go"}', "a", "b"]);
    t.send("c");
    expect(sent[sent.length - 1]).toBe("c");
  });

  test("decodes frames for subscribers, unsubscribe stops them", () => {
    const { sock } = fakeSocket(1);
    const t = streamTransport(sock, {}, () => {});
    const got: string[] = [];
    const h = (m: string) => got.push(m);
    t.subscribe(h);
    sock.onmessage({ data: new TextEncoder().encode('{"ä":1}').buffer });
    t.unsubscribe(h);
    sock.onmessage({ data: new TextEncoder().encode("{}").buffer });
    expect(got).toEqual(['{"ä":1}']);
  });

  test("workspace/applyEdit is answered here, not passed on", async () => {
    const { sock, sent } = fakeSocket(1);
    const edits: unknown[] = [];
    const t = streamTransport(sock, {}, () => {}, async (e) => (edits.push(e), true));
    const got: string[] = [];
    t.subscribe((m) => got.push(m));
    sock.onmessage({ data: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "workspace/applyEdit", params: { edit: { changes: {} } } }) });
    await Promise.resolve();
    expect(edits).toEqual([{ changes: {} }]);
    expect(got).toEqual([]);
    expect(JSON.parse(sent[0])).toEqual({ jsonrpc: "2.0", id: 7, result: { applied: true } });
  });

  test("workspace/configuration: gopls gets its hint settings, other sections null", () => {
    const { sock, sent } = fakeSocket(1);
    const t = streamTransport(sock, {}, () => {});
    const got: string[] = [];
    t.subscribe((m) => got.push(m));
    const params = { items: [{ section: "gopls" }, { section: "other" }] };
    sock.onmessage({ data: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "workspace/configuration", params }) });
    expect(got).toEqual([]);
    const reply = JSON.parse(sent[0]);
    expect(reply.id).toBe(3);
    expect(reply.result[0].hints.parameterNames).toBe(true);
    expect(reply.result[1]).toBeNull();
  });

  test("send on a closed stream throws, close is reported", () => {
    const { sock } = fakeSocket(3);
    let closed = 0;
    const t = streamTransport(sock, {}, () => closed++);
    expect(() => t.send("x")).toThrow();
    sock.onclose();
    expect(closed).toBe(1);
  });
});

test("fileUri escapes path segments", () => {
  expect(fileUri("/home/a b", "src/ü.go")).toBe("file:///home/a%20b/src/%C3%BC.go");
  expect(fileUri("/r")).toBe("file:///r");
});

test("uriPath: relative inside the workspace, absolute outside", () => {
  expect(uriPath("/r/my ws", "file:///r/my%20ws/a/b.go")).toBe("a/b.go");
  expect(uriPath("/r/my ws", "file:///usr/local/go/src/fmt/print.go")).toBe("/usr/local/go/src/fmt/print.go");
  expect(uriPath("/r", "file:///r2/x.go")).toBe("/r2/x.go");
  expect(uriPath("/r", "untitled:x")).toBeNull();
  expect(fileUri("/usr/x y.go")).toBe("file:///usr/x%20y.go");
});

test("serverFor: one server per language group", () => {
  expect(serverFor("a/main.go")).toEqual(["go", "gopls"]);
  expect(serverFor("x.c")).toEqual(["c", "clangd"]);
  expect(serverFor("x.HPP")).toEqual(["cpp", "clangd"]);
  expect(serverFor("x.tsx")).toEqual(["typescriptreact", "ts"]);
  expect(serverFor("x.mjs")).toEqual(["javascript", "ts"]);
  expect(serverFor("index.html")?.[1]).toBe("html");
  expect(serverFor("a.css")?.[1]).toBe("css");
  expect(serverFor("package.json")?.[1]).toBe("json");
  expect(serverFor("A.java")).toEqual(["java", "jdtls"]);
  expect(serverFor("README.md")).toBeUndefined();
  expect(serverFor("file:///usr/include/stdio.h")?.[1]).toBe("clangd");
});

const r = (l1: number, c1: number, l2: number, c2: number) => ({ start: { line: l1, character: c1 }, end: { line: l2, character: c2 } });

test("fileOps: changes or documentChanges, in order, with file operations inside the folder", () => {
  const e = { range: r(0, 0, 0, 1), newText: "x" };
  expect(fileOps("/r", { changes: { "file:///r/a.go": [e], "file:///r/b.go": [] } })).toEqual([{ kind: "edit", path: "a.go", edits: [e] }]);
  expect(fileOps("/r", {
    changes: { "file:///r/ignored.go": [e] }, // documentChanges win
    documentChanges: [
      { kind: "create", uri: "file:///r/new.ts" },
      { textDocument: { uri: "file:///r/new.ts" }, edits: [e] },
      { kind: "rename", oldUri: "file:///r/a.ts", newUri: "file:///r/b.ts" },
      { kind: "delete", uri: "file:///r/old.ts" },
      { kind: "delete", uri: "file:///etc/passwd" }, // outside the folder: never
      { kind: "rename", oldUri: "file:///r/x.ts", newUri: "file:///tmp/x.ts" },
    ],
  })).toEqual([
    { kind: "create", path: "new.ts" },
    { kind: "edit", path: "new.ts", edits: [e] },
    { kind: "rename", from: "a.ts", to: "b.ts" },
    { kind: "delete", path: "old.ts" },
  ]);
});

test("toChanges: sorted offsets, clamped to the line and the doc", () => {
  const doc = Text.of(["ab", "cd"]);
  expect(toChanges(doc, [
    { range: r(1, 0, 1, 1), newText: "C" }, { range: r(0, 0, 0, 9), newText: "A" }, { range: r(5, 0, 5, 0), newText: "!" },
  ])).toEqual([{ from: 0, to: 2, insert: "A" }, { from: 3, to: 4, insert: "C" }, { from: 5, to: 5, insert: "!" }]);
});
