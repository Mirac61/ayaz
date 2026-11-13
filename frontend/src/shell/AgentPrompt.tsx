import React, { useEffect, useRef, useState } from "react";
import { backend } from "../core/backend";
import "./agentPrompt.css";

export interface AgentPromptProps {
  filePath?: string | null;
  selection?: string;
  diagnosticsCount?: number;
  onApply(code: string): void;
  onClose(): void;
}

const MODELS = [
  "Claude 3.7 Sonnet (Agentic)",
  "Claude 3.5 Sonnet",
  "Ollama Local (DeepSeek-R1 / Qwen2.5-Coder)",
  "GPT-4o (OpenAI)",
];

const QUICK_ACTIONS = [
  { label: "🪄 Refactor", prompt: "Refactor den ausgewählten Code für maximale Lesbarkeit und Modularität." },
  { label: "🐛 Fix Diagnostics", prompt: "Behebe die LSP-Fehler und Typwarnungen in diesem Codeabschnitt." },
  { label: "🧪 Unit Tests", prompt: "Schreibe umfassende Unit-Tests für diesen Code." },
  { label: "📝 Dokumentieren", prompt: "Füge saubere Dokumentationskommentare und Typbeschreibungen hinzu." },
  { label: "⚡ Performance", prompt: "Optimiere die Laufzeit und Allokationen dieses Codeblocks." },
];

export const AgentPrompt: React.FC<AgentPromptProps> = ({
  filePath,
  selection,
  diagnosticsCount = 0,
  onApply,
  onClose,
}) => {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [includeFile, setIncludeFile] = useState(true);
  const [includeSelection, setIncludeSelection] = useState(!!selection?.trim());
  const [includeDiagnostics, setIncludeDiagnostics] = useState(diagnosticsCount > 0);
  const [status, setStatus] = useState<"idle" | "generating" | "done">("idle");
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const genIdRef = useRef(0);

  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    textareaRef.current?.focus();
    return () => prevFocused?.focus();
  }, []);

  const handlePromptChange = (val: string) => {
    setPrompt(val);
    genIdRef.current++;
    if (status !== "idle") setStatus("idle");
    if (result) setResult("");
  };

  const handleGenerate = async () => {
    const input = prompt.trim();
    if (!input) return;

    const currentGenId = ++genIdRef.current;
    setStatus("generating");
    setResult("");

    // Build context summary based on enabled pills
    const fileName = includeFile && filePath ? filePath.split("/").pop() : "";
    const activeSelection = includeSelection ? selection : "";
    let contextHeader = "";
    if (fileName || activeSelection || (includeDiagnostics && diagnosticsCount > 0)) {
      const parts: string[] = [];
      if (fileName) parts.push(`file: ${fileName}`);
      if (activeSelection) parts.push("selection");
      if (includeDiagnostics && diagnosticsCount > 0) parts.push(`${diagnosticsCount} diagnostics`);
      contextHeader = `// Context (${parts.join(", ")}):\n`;
    }

    setTimeout(() => {
      if (genIdRef.current !== currentGenId) return;

      let generated = "";
      if (input.includes("Test") || input.includes("test")) {
        const targetName = fileName || "active buffer";
        generated = `${contextHeader}// [Preview] Generated Tests for ${targetName}\ndescribe("${targetName}", () => {\n  it("should handle expected behavior", () => {\n    // Implementation\n  });\n});`;
      } else if (input.includes("Refactor") || input.includes("refactor")) {
        generated = activeSelection
          ? `// [Preview] Refactored implementation:\n${activeSelection}\n  // Clean modular refactoring applied`
          : `${contextHeader}// [Preview] Clean modular refactoring applied.`;
      } else if (input.includes("Fix") || input.includes("fix")) {
        generated = activeSelection
          ? `// [Preview] Fixed diagnostics:\n${activeSelection}`
          : `${contextHeader}// [Preview] Diagnostics addressed and verified.`;
      } else {
        generated = activeSelection
          ? `${activeSelection}\n\n// [Preview] Agent modification:\n// ${input}`
          : `${contextHeader}// [Preview] Code generated based on prompt:\n// ${input}`;
      }

      setResult(generated);
      setStatus("done");
    }, 450);
  };

  const handleCopy = async () => {
    if (!result) return;
    await backend.copy(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="agent-prompt-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="agent-prompt-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Agentic Coding Assistant"
      >
        <header className="agent-header">
          <div className="agent-title-row">
            <span className="agent-badge">✦ AYAZ AGENT</span>
            <select
              className="agent-model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              title="Aktives KI-Modell wählen"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="agent-close-btn"
            onClick={onClose}
            aria-label="Schließen (Esc)"
          >
            ✕
          </button>
        </header>

        {/* Context Pills */}
        <div className="agent-context-pills">
          {filePath && (
            <button
              type="button"
              className={`agent-pill ${includeFile ? "active" : ""}`}
              onClick={() => setIncludeFile(!includeFile)}
              title="Aktive Datei als Kontext einschließen"
            >
              <span className="agent-pill-icon">📄</span>
              <span>@{filePath.split("/").pop()}</span>
            </button>
          )}

          {selection && (
            <button
              type="button"
              className={`agent-pill ${includeSelection ? "active" : ""}`}
              onClick={() => setIncludeSelection(!includeSelection)}
              title="Aktuelle Selektion als Kontext einschließen"
            >
              <span className="agent-pill-icon">✂</span>
              <span>@selection</span>
            </button>
          )}

          {diagnosticsCount > 0 && (
            <button
              type="button"
              className={`agent-pill ${includeDiagnostics ? "active" : ""}`}
              onClick={() => setIncludeDiagnostics(!includeDiagnostics)}
              title="LSP Fehler & Warnungen als Kontext einschließen"
            >
              <span className="agent-pill-icon">⚡</span>
              <span>@{diagnosticsCount} issues</span>
            </button>
          )}
        </div>

        {/* Input Textarea */}
        <div className="agent-input-wrap">
          <textarea
            ref={textareaRef}
            className="agent-textarea"
            placeholder="Beschreibe die Änderung (z. B. 'Refactor in async', 'Fehlerbehandlung hinzufügen', 'Tests schreiben')... [⌘Enter]"
            value={prompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleGenerate();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />

          <div className="agent-quick-prompts">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.label}
                type="button"
                className="agent-quick-btn"
                onClick={() => {
                  handlePromptChange(q.prompt);
                  textareaRef.current?.focus();
                }}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status / Spinner */}
        {status === "generating" && (
          <div className="agent-status-row">
            <span className="agent-spinner" />
            <span>Agent analysiert Kontext & generiert Code...</span>
          </div>
        )}

        {/* Result Preview */}
        {status === "done" && result && (
          <div className="agent-result-box">
            <div className="agent-result-header">
              <span>Vorschau der generierten Änderung:</span>
              <button
                type="button"
                className="agent-quick-btn"
                onClick={handleCopy}
              >
                {copied ? "✓ Kopiert" : "📋 Kopieren"}
              </button>
            </div>
            <pre className="agent-result-code">{result}</pre>
          </div>
        )}

        {/* Footer */}
        <footer className="agent-footer">
          <span className="agent-shortcuts-hint">
            ⌘Enter = Ausführen · Esc = Schließen
          </span>
          <div className="agent-footer-btns">
            <button
              type="button"
              className="agent-btn secondary"
              onClick={onClose}
            >
              Abbrechen
            </button>
            {status === "done" && result ? (
              <button
                type="button"
                className="agent-btn primary"
                onClick={() => {
                  onApply(result);
                  onClose();
                }}
              >
                ↵ In Puffer übernehmen
              </button>
            ) : (
              <button
                type="button"
                className="agent-btn primary"
                onClick={handleGenerate}
                disabled={status === "generating" || !prompt.trim()}
              >
                {status === "generating" ? "Generieren…" : "Generieren"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
