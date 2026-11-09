// Spike S1: 10,000 plain DOM rows plus an FPS readout while scrolling. Throwaway, removed after M0.
import { useEffect, useState } from "react";

const rows = Array.from({ length: 10_000 }, (_, i) => i);

export function ScrollTest() {
  const [fps, setFps] = useState(0);
  const [worst, setWorst] = useState(0); // longest frame in the last second, ms (K5: none > 50 ms)

  useEffect(() => {
    let frames = 0, last = performance.now(), prev = last, max = 0, id = 0;
    const tick = (now: number) => {
      frames++;
      max = Math.max(max, now - prev);
      prev = now;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        setWorst(Math.round(max));
        frames = 0;
        max = 0;
        last = now;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "4px 8px", background: "var(--bg-0)", color: "var(--fg-3)" }}>
        S1 · {rows.length} rows · {fps} fps · worst frame {worst} ms
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {rows.map((i) => (
          <div key={i} style={{ padding: "0 8px", borderBottom: "1px solid var(--bg-3)" }}>
            <span style={{ color: "var(--fg-3)" }}>{String(i + 1).padStart(5, " ")}</span>{" "}
            <span style={{ color: "var(--accent)" }}>func</span> row{i}() {"{"} return {i} {"}"}
          </div>
        ))}
      </div>
    </div>
  );
}
