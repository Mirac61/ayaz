import { describe, it, expect } from "vitest";
import { zoneAt } from "./dnd";

describe("drag-and-drop zoneAt logic", () => {
  const rect = { left: 100, top: 100, width: 400, height: 400 };

  it("identifies center zone within the inner 70% of pane", () => {
    // Exact center
    expect(zoneAt(rect, 300, 300)).toBe("center");
    // Slightly off center (e.g. 25% from left: x = 200, which is > 15%)
    expect(zoneAt(rect, 200, 300)).toBe("center");
    expect(zoneAt(rect, 350, 300)).toBe("center");
    expect(zoneAt(rect, 300, 200)).toBe("center");
    expect(zoneAt(rect, 300, 350)).toBe("center");
  });

  it("identifies edge split zones within 15% outer boundary", () => {
    // Left edge (10% from left: x = 140)
    expect(zoneAt(rect, 140, 300)).toBe("left");
    // Right edge (10% from right: x = 460)
    expect(zoneAt(rect, 460, 300)).toBe("right");
    // Top edge (10% from top: y = 140)
    expect(zoneAt(rect, 300, 140)).toBe("top");
    // Bottom edge (10% from bottom: y = 460)
    expect(zoneAt(rect, 300, 460)).toBe("bottom");
  });

  it("always returns center when dropped on a tabbar regardless of coordinates", () => {
    // Even near the left or right edge, if isTabbar is true, it must be center
    expect(zoneAt(rect, 105, 105, true)).toBe("center");
    expect(zoneAt(rect, 495, 105, true)).toBe("center");
    expect(zoneAt(rect, 495, 495, true)).toBe("center");
  });
});
