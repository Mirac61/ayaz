import { useEffect, useState } from "react";
import { backend } from "./core/backend";
import { ScrollTest } from "./spikes/ScrollTest";

export default function App() {
  const [ping, setPing] = useState("…");

  useEffect(() => {
    backend.ping().then(setPing, (e) => setPing(`error: ${e}`));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ScrollTest />
      </div>
      <div style={{ padding: "2px 8px", borderTop: "1px solid var(--border)", color: "var(--fg-dim)" }}>
        ayaz · ping: {ping}
      </div>
    </div>
  );
}
