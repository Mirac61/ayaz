import { describe, expect, test } from "vitest";
import { fileUri, serverFor, streamTransport, uriPath } from "./lsp";

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
