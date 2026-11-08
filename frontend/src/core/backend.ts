// The only place that imports generated bindings or the Wails runtime (02-architecture, principle 2).
import { Stream } from "@wailsio/runtime";
import { PingService } from "../../bindings/github.com/Mirac61/ayaz/app";
import type { Match } from "../../bindings/github.com/Mirac61/ayaz/app";

export type { Match };

export interface Backend {
  ping(): Promise<string>;
  matches(n: number): Promise<Match[]>;
  report(line: string): Promise<void>;
  spikeMode(): Promise<string>;
  stream(name: string): WebSocket;
}

export const backend: Backend = {
  ping: () => PingService.Ping(),
  matches: async (n) => (await PingService.Matches(n)) ?? [], // Go nil slice arrives as null
  report: (line) => PingService.Report(line),
  spikeMode: () => PingService.SpikeMode(),
  // WailsSocket implements the WebSocket subset we use.
  stream: (name) => Stream(name) as WebSocket,
};
