import { useEffect, useState } from "react";
import { backend } from "./core/backend";
import { ScrollTest } from "./spikes/ScrollTest";
import { runS4, type Stats } from "./spikes/bindingLatency";

const fmt = (s: Stats) => `p50 ${s.p50.toFixed(3)} · p95 ${s.p95.toFixed(3)} · max ${s.max.toFixed(3)} ms`;

export default function App() {
  const [ping, setPing] = useState("…");
  const [s4, setS4] = useState("S4 running…");

  useEffect(() => {
    backend.ping().then(setPing, (e) => setPing(`error: ${e}`));
    runS4().then(
      (r) => {
        const line = `S4 empty: ${fmt(r.empty)} | 50 results: ${fmt(r.fifty)}`;
        setS4(line);
        backend.report(line);
      },
      (e) => setS4(`S4 error: ${e}`),
    );
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ScrollTest />
      </div>
      <div style={{ padding: "2px 8px", borderTop: "1px solid var(--border)", color: "var(--fg-dim)" }}>
        ayaz · ping: {ping} · {s4}
      </div>
    </div>
  );
}
