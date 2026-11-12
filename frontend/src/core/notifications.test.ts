import { describe, it, expect, beforeEach, vi } from "vitest";
import { notify } from "./notifications";

describe("notify store", () => {
  beforeEach(() => {
    notify.clear();
    vi.useRealTimers();
  });

  it("adds and dismisses toasts", () => {
    let count = 0;
    const unsub = notify.subscribe(() => {
      count++;
    });

    const id = notify.say("File saved");
    expect(notify.toasts.length).toBe(1);
    expect(notify.toasts[0].text).toBe("File saved");
    expect(notify.toasts[0].kind).toBe("success");
    expect(count).toBe(1);

    notify.dismiss(id);
    expect(notify.toasts.length).toBe(0);
    expect(count).toBe(2);

    unsub();
  });

  it("caps toasts at 5 items", () => {
    for (let i = 0; i < 8; i++) {
      notify.info(`Message ${i}`, 0);
    }
    expect(notify.toasts.length).toBe(5);
    expect(notify.toasts[4].text).toBe("Message 7");
  });

  it("supports error and warning toasts", () => {
    notify.fail("Syntax error", 0);
    notify.warn("Unused variable", 0);

    expect(notify.toasts[0].kind).toBe("error");
    expect(notify.toasts[1].kind).toBe("warning");
  });
});
