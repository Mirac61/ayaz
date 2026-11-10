import { expect, test } from "vitest";
import { loadSnippets, parseSnippets, snippetsError, snippetsFor } from "./snippets";

const FILE = `{
  // my snippets
  "go": {
    "iferr": { "prefix": "iferr", "body": ["if err != nil {", "\\treturn $1err", "}", "$0"], "description": "return the error" },
    "two": { "prefix": ["pl", "println"], "body": "fmt.Println(\${1:x})", },
  },
  "*": { "todo": { "prefix": "todo", "body": "// TODO: $1" } },
}`;

test("VS Code's shape: prefix as text or list, body as text or lines, $n becomes ${n}", () => {
  const m = parseSnippets(FILE);
  expect(m.get("go")).toEqual([
    { prefix: "iferr", body: "if err != nil {\n\treturn ${1}err\n}\n${0}", description: "return the error" },
    { prefix: "pl", body: "fmt.Println(${1:x})", description: "two" },
    { prefix: "println", body: "fmt.Println(${1:x})", description: "two" },
  ]);
  expect(m.get("*")![0].body).toBe("// TODO: ${1}");
});

test("a broken file says where, and loading it keeps the snippets from before", () => {
  expect(() => parseSnippets("{ nope")).toThrow("snippets.json");
  expect(() => parseSnippets('{ "go": { "x": { "body": "a" } } }')).toThrow('go.x needs a "prefix"');
  expect(() => parseSnippets('{ "go": { "x": { "prefix": "x", "body": 3 } } }')).toThrow('go.x needs a "body"');
  expect(() => parseSnippets('{ "go": [] }')).toThrow('"go" must be an object');
  loadSnippets(FILE);
  loadSnippets("{ nope");
  expect(snippetsError()).toContain("snippets.json");
  expect(snippetsFor("go").map((s) => s.prefix)).toEqual(["iferr", "pl", "println", "todo"]); // own first, then "*"
  loadSnippets("");
  expect(snippetsError()).toBe("");
  expect(snippetsFor("go")).toEqual([]);
});
