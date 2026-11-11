import { expect, test } from "vitest";
import { localUrl } from "./browser";

test("localUrl accepts local addresses only", () => {
  expect(localUrl("3000")).toBe("http://localhost:3000/");
  expect(localUrl("127.0.0.1:8080/x")).toBe("http://127.0.0.1:8080/x");
  expect(localUrl("https://localhost:5173")).toBe("https://localhost:5173/");
  expect(localUrl("example.com")).toBeNull();
  expect(localUrl("http://localhost.evil.com")).toBeNull();
  expect(localUrl("http://localhost@evil.com")).toBeNull();
  expect(localUrl("javascript:alert(1)")).toBeNull();
  expect(localUrl("")).toBeNull();
});
