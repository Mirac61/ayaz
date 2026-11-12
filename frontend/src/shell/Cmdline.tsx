import { useEffect, useRef, useState } from "react";
import type { Command } from "../core/commands";
import "./cmdline.css";

export interface CmdlineProps {
  initial?: string;
  mode?: "ex" | "search";
  commands?: Command[];
  onExecuteEx(line: string): void;
  onExecuteCommand?(cmdId: string): void;
  onClose(): void;
}

interface Suggestion {
  id: string;
  label: string;
  hint: string;
  type: "ex" | "cmd";
  value: string;
}

const COMMON_EX = [
  { cmd: "w", desc: "Save active file" },
  { cmd: "w!", desc: "Force save active file" },
  { cmd: "wa", desc: "Save all modified files" },
  { cmd: "q", desc: "Quit window or close tab" },
  { cmd: "q!", desc: "Force quit pane without saving" },
  { cmd: "qa", desc: "Quit window / all panes" },
  { cmd: "qa!", desc: "Force close window and discard unsaved" },
  { cmd: "qall!", desc: "Force close window and discard unsaved" },
  { cmd: "wq", desc: "Save file and quit" },
  { cmd: "wqa", desc: "Save all files and close window" },
  { cmd: "x", desc: "Save file and quit" },
  { cmd: "xa", desc: "Save all files and close window" },
  { cmd: "e ", desc: "Open file (:e path)" },
  { cmd: "b ", desc: "Switch buffer (:b name)" },
  { cmd: "bd", desc: "Close buffer" },
  { cmd: "sp", desc: "Split horizontally" },
  { cmd: "vsp", desc: "Split vertically" },
  { cmd: "s/", desc: "Substitute on line (:s/pat/rep/g)" },
  { cmd: "%s/", desc: "Substitute in file (:%s/pat/rep/g)" },
  { cmd: "set number", desc: "Show line numbers" },
  { cmd: "set nonumber", desc: "Hide line numbers" },
  { cmd: "set wrap", desc: "Enable line wrap" },
  { cmd: "set nowrap", desc: "Disable line wrap" },
  { cmd: "noh", desc: "Clear search highlighting" },
  { cmd: "checkupdate", desc: "Check for Ayaz updates" },
  { cmd: "help", desc: "Show keybindings" },
];

const HISTORY_KEY = "ayaz.cmdline.history";

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(item: string) {
  if (!item.trim()) return;
  try {
    const hist = loadHistory().filter((x) => x !== item);
    hist.unshift(item);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 50)));
  } catch {}
}

export function Cmdline({
  initial = "",
  mode = "ex",
  commands = [],
  onExecuteEx,
  onExecuteCommand,
  onClose,
}: CmdlineProps) {
  const [val, setVal] = useState(initial);
  const [cursor, setCursor] = useState(0);
  const history = useRef<string[]>(loadHistory());
  const historyIdx = useRef<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Compute suggestions
  const q = val.trim().toLowerCase();
  const suggestions: Suggestion[] = [];

  if (mode === "ex") {
    const clean = val.startsWith(":") ? val.slice(1).trim().toLowerCase() : q;
    for (const item of COMMON_EX) {
      if (item.cmd.toLowerCase().startsWith(clean) || (!clean && ["w", "q", "wq", "checkupdate"].includes(item.cmd))) {
        suggestions.push({
          id: `ex-${item.cmd}`,
          label: `:${item.cmd}`,
          hint: item.desc,
          type: "ex",
          value: item.cmd,
        });
      }
    }

    if (clean.length >= 2) {
      for (const cmd of commands) {
        if (cmd.title.toLowerCase().includes(clean)) {
          suggestions.push({
            id: `cmd-${cmd.id}`,
            label: cmd.title,
            hint: "command",
            type: "cmd",
            value: cmd.id,
          });
        }
      }
    }
  }

  // Ensure cursor within bounds
  useEffect(() => {
    if (cursor >= suggestions.length) {
      setCursor(Math.max(0, suggestions.length - 1));
    }
  }, [suggestions.length, cursor]);

  const submit = () => {
    const raw = val.trim();
    if (!raw) {
      onClose();
      return;
    }

    // Check if user has highlighted a specific suggestion
    if (suggestions[cursor] && suggestions[cursor].type === "cmd") {
      onExecuteCommand?.(suggestions[cursor].value);
      saveHistory(val);
      onClose();
      return;
    }

    // Otherwise execute as Ex command
    const toRun = raw.startsWith(":") ? raw.slice(1) : raw;
    saveHistory(toRun);
    onExecuteEx(toRun);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" || (e.ctrlKey && e.key === "c")) {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      if (suggestions.length > 0) {
        setCursor((c) => (c + 1) % suggestions.length);
        listRef.current?.children[(cursor + 1) % suggestions.length]?.scrollIntoView({ block: "nearest" });
      } else if (history.current.length > 0) {
        const next = Math.max(-1, historyIdx.current - 1);
        historyIdx.current = next;
        setVal(next === -1 ? "" : history.current[next]);
      }
      return;
    }

    if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      if (suggestions.length > 0) {
        setCursor((c) => (c - 1 + suggestions.length) % suggestions.length);
        listRef.current?.children[(cursor - 1 + suggestions.length) % suggestions.length]?.scrollIntoView({ block: "nearest" });
      } else if (history.current.length > 0) {
        const next = Math.min(history.current.length - 1, historyIdx.current + 1);
        historyIdx.current = next;
        setVal(history.current[next]);
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const current = suggestions[cursor];
      if (current) {
        if (current.type === "ex") {
          setVal(current.value);
        } else {
          setVal(current.label);
        }
      }
    }
  };

  return (
    <div className="cmdline-backdrop" onMouseDown={onClose}>
      <div
        className="cmdline-window"
        role="dialog"
        aria-label="Command Line"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdline-bar">
          <div className={`cmdline-badge mode-${mode}`}>
            <span className="cmdline-icon">{mode === "ex" ? ":" : "/"}</span>
            <span>{mode === "ex" ? "cmd" : "find"}</span>
          </div>
          <input
            ref={inputRef}
            className="cmdline-input"
            value={val}
            onChange={(e) => {
              setVal(e.target.value);
              historyIdx.current = -1;
            }}
            onKeyDown={handleKeyDown}
            placeholder={mode === "ex" ? "w (save), q (quit), %s/old/new/g, checkupdate..." : "Search text..."}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        {suggestions.length > 0 && (
          <ul className="cmdline-suggestions" ref={listRef} role="listbox">
            {suggestions.slice(0, 8).map((s, idx) => (
              <li
                key={s.id}
                role="option"
                aria-selected={idx === cursor}
                className={`cmdline-item ${idx === cursor ? "selected" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (s.type === "ex") {
                    setVal(s.value);
                    saveHistory(s.value);
                    onExecuteEx(s.value);
                  } else {
                    onExecuteCommand?.(s.value);
                  }
                  onClose();
                }}
              >
                <div className="cmdline-item-label">
                  <span className="cmdline-item-prefix">{s.type === "ex" ? ":" : "›"}</span>
                  <span>{s.label}</span>
                </div>
                <span className="cmdline-item-hint">{s.hint}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
