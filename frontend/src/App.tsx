import { useEffect, useRef, useState } from "react";
import { backend } from "./core/backend";
import { loadSettings } from "./core/settings";
import { openTerminal } from "./terminal/terminal";
import { Shell } from "./shell/Workbench";
import { ScrollTest } from "./spikes/ScrollTest";
import { runS4, type Stats } from "./spikes/bindingLatency";
import { runS6, runS7 } from "./spikes/terminalBench";
import { runK8 } from "./spikes/pdfRam";
import { runS8 } from "./spikes/pdfS8";

const fmt = (s: Stats) => `p50 ${s.p50.toFixed(3)} · p95 ${s.p95.toFixed(3)} · max ${s.max.toFixed(3)} ms`;

// AYAZ_SPIKE picks the view: "" editor (?view=term: terminal only), "s1" scroll test, "bench" runs S4/S6/S7 and reports to stdout,
// "k8" the editor scrolling through big.pdf by itself (scripts/ram.sh measures).
const termOnly = new URLSearchParams(location.search).get("view") === "term";

export default function App() {
  const [mode, setMode] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const termEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Settings before the first editor: they go into every editor state.
    backend.settings()
      .then(loadSettings, () => loadSettings(""))
      .then(() => backend.spikeMode())
      .then(setMode, () => setMode(""));
  }, []);

  // app:ready once the first real frame is painted (two rAFs: the second runs after the first paint).
  useEffect(() => {
    if (mode !== null) requestAnimationFrame(() => requestAnimationFrame(() => backend.ready()));
  }, [mode !== null]);

  useEffect(() => {
    const el = termEl.current;
    if (mode === "" && termOnly && el) {
      // ?renderer=dom for E2E (WebGL draws to a canvas, so there's no text to assert on) and Linux checks.
      const renderer = new URLSearchParams(location.search).get("renderer") === "dom" ? "dom" : "webgl";
      const h = openTerminal(el, { renderer });
      h.focus();
      return () => h.dispose();
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
    if (mode === "s8") runS8().catch((e) => backend.report(`s8 error: ${e}`));
    if (mode === "k8") runK8().catch((e) => backend.report(`k8 error: ${e}`));
  }, [mode]);

  if (mode === null) return null;
  if ((mode === "" || mode === "k8") && !termOnly) return <Shell />;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, padding: mode === "s1" ? 0 : 4 }}>
        {mode === "s1" ? <ScrollTest /> : <div ref={termEl} style={{ height: "100%" }} />}
      </div>
      {status && (
        <div style={{ padding: "2px 8px", borderTop: "1px solid var(--bg-3)", color: "var(--fg-3)" }}>{status}</div>
      )}
    </div>
  );
}
