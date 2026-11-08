// The only place that imports generated bindings or the Wails runtime (02-architecture, principle 2).
import { PingService } from "../../bindings/github.com/Mirac61/ayaz/app";

export interface Backend {
  ping(): Promise<string>;
}

export const backend: Backend = {
  ping: () => PingService.Ping(),
};
