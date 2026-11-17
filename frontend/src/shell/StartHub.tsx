import { useEffect, useState, type ReactNode } from "react";
import { FileSearch, FolderOpen, GitBranch, SquareTerminal, TextSearch } from "lucide-react";
import { backend } from "../core/backend";
import { AyazLogo } from "./AyazLogo";
import { recentFolders } from "./folders";
import { ago, branchText } from "./startPage";
import "./startHub.css";

const short = (p: string) => p.replace(/^(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\]+/, "~");

interface Props {
  name: string;
  root: string;
  branch: string;
  changes: number;
  files: string[]; // recently opened files, newest first
  keys(command: string): string | undefined;
  run(command: string, arg?: string): void;
  switchTo(root: string): void;
}

// What an empty window shows: where you are (folder, branch, changes), the first things to do, the folders and files
// you were in last. Mouse shortcuts to the same commands the keys run; the keys are printed next to each.
export function StartHub({ name, root, branch, changes, files, keys, run, switchTo }: Props) {
  // Branch and age of the other recent folders, one `git status` each; a folder that is gone just has no detail.
  const others = recentFolders()
    .filter((f) => f.root !== root)
    .slice(0, 4);
  const [detail, setDetail] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    for (const f of others) {
      backend.folderSummary(f.root).then(
        (s) => live && setDetail((d) => ({ ...d, [f.root]: s.repo ? branchText(s) : "" })),
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, [others.map((f) => f.root).join("\n")]);

  const action = (command: string, what: string, icon: ReactNode) => (
    <button
      key={command}
      type="button"
      className="hub-row"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(command)}
    >
      <span className="hub-icon">{icon}</span>
      <span className="hub-what">{what}</span>
      <kbd>{keys(command)}</kbd>
    </button>
  );

  return (
    <div className="pane-empty">
      <div className="hub">
        <header className="hub-head">
          <AyazLogo size={40} className="pane-empty-logo" />
          <div className="hub-title">
            <div className="pane-empty-name">{name}</div>
            <div className="hub-sub" title={root}>
              {branch ? (
                <>
                  <GitBranch aria-hidden />
                  <span>{branch}</span>
                  <span className="hub-dot">·</span>
                  <span>{changes ? `${changes} changed` : "clean"}</span>
                </>
              ) : (
                <span>{short(root)}</span>
              )}
            </div>
          </div>
        </header>

        <section className="hub-section">
          {action("folder.switch", "Switch project", <FolderOpen />)}
          {action("find.files", "Go to file", <FileSearch />)}
          {action("find.grep", "Search in files", <TextSearch />)}
          {action("term.panel", "Terminal", <SquareTerminal />)}
          <div className="hub-more">
            <span>Command palette</span>
            <kbd>{keys("find.commands")}</kbd>
            <span>File tree</span>
            <kbd>{keys("tree.focus")}</kbd>
          </div>
        </section>

        {others.length > 0 && (
          <section className="hub-section">
            <div className="label">Recent projects</div>
            {others.map((f) => (
              <button
                key={f.root}
                type="button"
                className="hub-row hub-project"
                tabIndex={-1}
                title={f.root}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => switchTo(f.root)}
              >
                <span className="hub-what">{f.name}</span>
                <span className="hub-meta">{[detail[f.root], ago(f.at)].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </section>
        )}

        {files.length > 0 && (
          <section className="hub-section">
            <div className="label">Recent files</div>
            {files.map((p, i) => (
              <button
                key={p}
                type="button"
                className={i ? "pane-empty-file" : "pane-empty-file first"}
                tabIndex={-1}
                title={p}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run("file.open", p)}
              >
                <span className="dir">{p.slice(0, p.lastIndexOf("/") + 1)}</span>
                {p.slice(p.lastIndexOf("/") + 1)}
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
