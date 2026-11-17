// What the last test run reported, per file. Nothing here knows about the editor or the terminal.
import type { TestResult } from "./tests";

export interface FileResults {
  byName: Map<string, TestResult>;
  at: number; // when it was reported
}

export class TestResults {
  private m = new Map<string, FileResults>();
  private subs = new Set<() => void>();

  // Replaces the file's results. When a name appears twice (two packages), a failure wins.
  set(path: string, results: TestResult[], at: number) {
    const byName = new Map<string, TestResult>();
    for (const r of results) {
      if (byName.get(r.name)?.status !== "fail") {
        byName.set(r.name, r);
      }
    }
    this.m.set(path, { byName, at });
    this.subs.forEach((f) => f());
  }

  get(path: string): FileResults | undefined {
    return this.m.get(path);
  }

  clear(path: string) {
    if (this.m.delete(path)) {
      this.subs.forEach((f) => f());
    }
  }

  // Returns the function that unsubscribes.
  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }
}

export const testResults = new TestResults();
