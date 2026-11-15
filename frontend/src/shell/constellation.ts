// Recent folders as a star chart: the newest folder is the brightest star, a line joins them in the order they were opened.
// Slots are fixed so the chart looks the same every time. x and y are in the chart's own 580 x 372 box;
// dx and dy put the name next to the star, end means the name sits left of it.
export const CHART = { w: 580, h: 372 };

export const SLOTS = [
  { x: 70, y: 60, dx: 14, dy: -8 },
  { x: 205, y: 124, dx: 14, dy: 5 },
  { x: 140, y: 206, dx: -14, dy: 5, end: true },
  { x: 292, y: 238, dx: 14, dy: 18 },
  { x: 392, y: 88, dx: 12, dy: -10 },
  { x: 440, y: 180, dx: 14, dy: 5 },
  { x: 404, y: 306, dx: 14, dy: 5 },
  { x: 226, y: 324, dx: 12, dy: -12 },
  { x: 130, y: 300, dx: -14, dy: 5, end: true },
] as const;

export const MAX_STARS = SLOTS.length;

export interface Star {
  i: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  end: boolean;
  r: number; // the newest is biggest
  opacity: number;
}

export function stars(count: number): Star[] {
  return SLOTS.slice(0, Math.min(count, MAX_STARS)).map((s, i) => ({
    i,
    x: s.x,
    y: s.y,
    dx: s.dx,
    dy: s.dy,
    end: "end" in s,
    r: 3.2 - i * 0.18,
    opacity: 1 - i * 0.06,
  }));
}
