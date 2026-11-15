import { expect, it } from "vitest";
import { CHART, MAX_STARS, SLOTS, stars } from "./constellation";
import { ago, branchText, changedNames, changesText, clip, sky } from "./startPage";

it("gives the newest folder the brightest, biggest star and stops after nine", () => {
  const s = stars(12);
  expect(s).toHaveLength(MAX_STARS);
  expect(s[0].r).toBeGreaterThan(s[8].r);
  expect(s[0].opacity).toBeGreaterThan(s[8].opacity);
  expect(stars(0)).toEqual([]);
  expect(new Set(s.map((x) => `${x.x},${x.y}`)).size).toBe(MAX_STARS);
});

it("keeps every star and the room for its name inside the chart", () => {
  for (const s of SLOTS) {
    expect(s.y).toBeGreaterThan(0);
    expect(s.y).toBeLessThan(CHART.h);
    // a name of 14 characters plus its number is about 120 units wide
    const edge = "end" in s ? s.x + s.dx - 120 : s.x + s.dx + 120;
    expect(edge).toBeGreaterThanOrEqual(-20);
    expect(edge).toBeLessThanOrEqual(CHART.w + 20);
  }
});

it("clips long names", () => {
  expect(clip("Computerarchitektur")).toBe("Computerarchi…");
  expect(clip("ayaz")).toBe("ayaz");
});

it("describes a folder like the mockup does", () => {
  const s = { repo: true, branch: "dev", ahead: 2, behind: 0, changed: ["app/history.go", "README.md", "a/b/c.ts", "d.go"] };
  expect(branchText(s)).toBe("dev, 2 commits ahead");
  expect(branchText({ ...s, ahead: 0 })).toBe("dev, up to date");
  expect(branchText({ ...s, ahead: 1, behind: 3 })).toBe("dev, 1 commit ahead, 3 commits behind");
  expect(branchText({ ...s, repo: false })).toBe("No git repository");
  expect(changesText(s)).toBe("4 files not committed");
  expect(changesText({ ...s, changed: [] })).toBe("Nothing to commit");
  expect(changedNames(s)).toBe("history.go, README.md, c.ts");
});

it("says when a folder was opened", () => {
  const now = Date.UTC(2026, 10, 15, 12);
  const h = 3_600_000;
  expect(ago(undefined, now)).toBe("");
  expect(ago(now - 2 * h, now)).toBe("2 hours ago");
  expect(ago(now - 30 * h, now)).toBe("yesterday");
  expect(ago(now - 4 * 24 * h, now)).toBe("4 days ago");
  expect(ago(now - 9 * 24 * h, now)).toBe("last week");
  expect(ago(now - 20 * 24 * h, now)).toBe("2 weeks ago");
});

it("draws the same sky every time", () => {
  expect(sky()).toEqual(sky());
  expect(sky(10)).toHaveLength(10);
});
