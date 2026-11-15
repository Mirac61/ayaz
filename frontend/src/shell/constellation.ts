// Recent folders as a star chart: the newest folder is the brightest star, a line joins them in the order they were opened.
// Slots are fixed so the chart looks the same every time; x and y are percent of the chart, side is where the name sits.
export const SLOTS = [
  { x: 12, y: 17, side: "right" },
  { x: 35, y: 34, side: "right" },
  { x: 24, y: 57, side: "left" },
  { x: 50, y: 66, side: "right" },
  { x: 62, y: 22, side: "right" },
  { x: 70, y: 50, side: "right" },
  { x: 66, y: 82, side: "right" },
  { x: 39, y: 90, side: "right" },
  { x: 22, y: 83, side: "left" },
] as const;

export const MAX_STARS = SLOTS.length;

export interface Star {
  i: number;
  x: number;
  y: number;
  side: "left" | "right";
  size: number; // px, the newest is biggest
  opacity: number;
}

export function stars(count: number): Star[] {
  return SLOTS.slice(0, Math.min(count, MAX_STARS)).map((s, i) => ({
    i,
    ...s,
    size: 7 - i * 0.4,
    opacity: 1 - i * 0.07,
  }));
}
