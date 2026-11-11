// Tasks a project already has: Makefile targets and Taskfile.yml tasks, next to the "tasks" of settings.json.
export interface ProjectTask { name: string; cmd: string }

// Plain "target: deps" lines. shortcut: no includes, pattern rules (%) or targets made by variables; upgrade when a Makefile needs them.
export function makeTargets(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    const m = /^([^\s#:=\t.][^:=#]*?)\s*:(?![=:])/.exec(line);
    if (!m) continue;
    for (const t of m[1].split(/\s+/)) if (/^[\w][\w.-]*$/.test(t)) out.add(t);
  }
  return [...out];
}

// The keys under the top-level "tasks:" of a Taskfile, two spaces in. shortcut: no tab indents or flow style.
export function taskfileTasks(text: string): string[] {
  const out: string[] = [];
  let inTasks = false;
  for (const line of text.split("\n")) {
    if (/^\S/.test(line)) inTasks = /^tasks:\s*(#.*)?$/.test(line);
    else if (inTasks) {
      const m = /^ {2}([\w][\w:.-]*):/.exec(line);
      if (m) out.push(m[1]);
    }
  }
  return out;
}

const MAKEFILES = ["Makefile", "makefile", "GNUmakefile"];
const TASKFILES = ["Taskfile.yml", "Taskfile.yaml"];

// settings.json's tasks first, then the Makefile's and the Taskfile's: "make build", "task build". Unreadable files add nothing.
export async function projectTasks(
  list: () => Promise<{ name: string; dir: boolean }[]>,
  read: (name: string) => Promise<string>,
  own: Record<string, string>,
): Promise<ProjectTask[]> {
  const tasks = Object.entries(own).map(([name, cmd]) => ({ name, cmd }));
  const names = new Set((await list().catch(() => [])).filter((e) => !e.dir).map((e) => e.name));
  const make = MAKEFILES.find((n) => names.has(n)), task = TASKFILES.find((n) => names.has(n));
  if (make) for (const t of makeTargets(await read(make).catch(() => ""))) tasks.push({ name: `make ${t}`, cmd: `make ${t}` });
  if (task) for (const t of taskfileTasks(await read(task).catch(() => ""))) tasks.push({ name: `task ${t}`, cmd: `task ${t}` });
  return tasks;
}
