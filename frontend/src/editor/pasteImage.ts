import { EditorView } from "@codemirror/view";
import { backend } from "../core/backend";
import { imageTarget } from "../core/pasteImage";

const base64 = async (f: Blob) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// Markdown buffers: pasting an image saves it next to the file and inserts `![](assets/…)`. Text pastes go on as usual.
export const pasteImage = (ws: string, file: string, say: (text: string) => void = () => {}) =>
  EditorView.domEventHandlers({
    paste(e, view) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === "file" && i.type.startsWith("image/"));
      const blob = item?.getAsFile();
      const target = item && blob && imageTarget(file, item.type, new Date());
      if (!target || !blob) return false;
      e.preventDefault();
      const at = view.state.selection.main;
      base64(blob)
        .then((data) => backend.files(ws).writeNew(target.path, data))
        .then(() => {
          view.dispatch({ changes: { from: at.from, to: at.to, insert: `![](${target.link})` } });
          say(`Saved ${target.path}`);
        }, (err) => say(`Pasted image not saved: ${err instanceof Error ? err.message : err}`));
      return true;
    },
  });
