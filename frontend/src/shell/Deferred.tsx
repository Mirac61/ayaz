import { Component, Suspense, type ReactNode } from "react";
import { notify } from "../core/notifications";
import { errText } from "./commands/context";

// Around a lazily loaded dialog: if its chunk fails to load, the dialog closes with a message; without this React
// would unmount the whole app. React keeps the failed import, so opening it again fails until a restart.
export class Deferred extends Component<{ onFail(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(e: unknown) {
    notify.fail(`Could not load the dialog, restart Ayaz: ${errText(e)}`);
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : <Suspense fallback={null}>{this.props.children}</Suspense>;
  }
}
