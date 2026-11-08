import { useEffect, useRef, useState } from "react";
import { backend } from "./core/backend";
import { openTerminal } from "./terminal/terminal";
import { ScrollTest } from "./spikes/ScrollTest";
import { runS4, type Stats } from "./spikes/bindingLatency";
import { runS6, runS7 } from "./spikes/terminalBench";

const fmt = (s: Stats) => `p50 ${s.p50.toFixed(3)} · p95 ${s.p95.toFixed(3)} · max ${s.max.toFixed(3)} ms`;

// AYAZ_SPIKE picks the view: "" interactive terminal, "s1" scroll test, "bench" runs S4/S6/S7 and reports to stdout.
export default function App() {
  const [mode, setMode] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const termEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    backend.spikeMode().then(setMode, () => setMode(""));
  }, []);

  // app:ready once the first real frame is painted (two rAFs: the second runs after the first paint).
  useEffect(() => {
    if (mode !== null) requestAnimationFrame(() => requestAnimationFrame(() => backend.ready()));
  }, [mode !== null]);

  useEffect(() => {
    const el = termEl.current;
    if (mode === "" && el) {
      const h = openTerminal(el, { renderer: "webgl" });
      h.then((t) => t.term.focus());
      return () => void h.then((t) => t.dispose());
    }
    if (mode === "bench" && el) {
      (async () => {
        const lines: string[] = [];
        const log = (l: string) => { lines.push(l); setStatus(l); };
        const s4 = await runS4();
        log(`S4 empty: ${fmt(s4.empty)} | 50 results: ${fmt(s4.fifty)}`);
        log(await runS7());
        for (const renderer of ["dom", "webgl"] as const)
          for (const [windowMs, maxBytes] of [[4, 16384], [8, 16384], [8, 65536]])
            log(await runS6(el, { renderer, windowMs, maxBytes }));
        await backend.report(lines.join("\n"));
      })().catch((e) => backend.report(`bench error: ${e}`));
    }
  }, [mode]);

  if (mode === null) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, padding: mode === "s1" ? 0 : 4 }}>
        {mode === "s1" ? <ScrollTest /> : <div ref={termEl} style={{ height: "100%" }} />}
      </div>
      {status && (
        <div style={{ padding: "2px 8px", borderTop: "1px solid var(--border)", color: "var(--fg-dim)" }}>{status}</div>
      )}
    </div>
  );
}
