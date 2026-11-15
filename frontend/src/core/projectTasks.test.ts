import { expect, test } from "vitest";
import { makeTargets, projectTasks, taskfileTasks } from "./projectTasks";

test("makeTargets reads plain targets and skips variables, patterns and dot targets", () => {
  const text = "CC := gcc\n.PHONY: all\nall build: deps\n\techo hi\n%.o: %.c\ntest:\nFOO = a:b\n";
  expect(makeTargets(text)).toEqual(["all", "build", "test"]);
});

test("taskfileTasks reads the keys under tasks only", () => {
  const text = "version: '3'\nvars:\n  A: b\ntasks:\n  build:\n    cmds:\n      - x\n  dev:server:\n    cmds: []\nincludes:\n  other: ./x\n";
  expect(taskfileTasks(text)).toEqual(["build", "dev:server"]);
});

test("projectTasks puts settings tasks first and survives unreadable files", async () => {
  const list = async () => [{ name: "Makefile", dir: false }, { name: "Taskfile.yml", dir: false }];
  const read = async (n: string) => { if (n === "Taskfile.yml") throw new Error("x"); return "run:\n"; };
  expect(await projectTasks(list, read, { lint: "pnpm lint" })).toEqual([
    { name: "lint", cmd: "pnpm lint" },
    { name: "make run", cmd: "make run" },
  ]);
});
