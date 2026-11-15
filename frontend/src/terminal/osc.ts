// OSC 7 carries the shell's folder as file://host/path with the path percent-encoded; "" for anything else.
export function parseOsc7(data: string): string {
  const m = /^file:\/\/[^/]*(\/.*)$/.exec(data);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return ""; // a stray % in a name the shell didn't encode
  }
}
