import { expect, test } from "vitest";
import { header } from "./sticky";

test("a header is the first line without its opening brace", () => {
  expect(header("func (t T) m(a int) int {")).toBe("func (t T) m(a int) int");
  expect(header("  class A extends B {  ")).toBe("class A extends B");
  expect(header("int main()")).toBe("int main()");
});
