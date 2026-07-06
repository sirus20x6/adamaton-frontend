import { describe, expect, it } from "vitest";

import { isResearchEvent } from "./ws";

describe("isResearchEvent", () => {
  it("accepts every known event type", () => {
    const events: unknown[] = [
      { type: "stage.started", stage: "live", at: 1 },
      { type: "stage.progress", stage: "indexed", pct: 50 },
      { type: "stage.result", stage: "graphed", payload: { ok: true } },
      { type: "stage.finished", stage: "curated", at: 2 },
      { type: "stage.error", stage: "live", error: "boom" },
      { type: "stage.skipped", stage: "indexed", reason: null },
      { type: "task.done", at: 3 },
      { type: "heartbeat", at: 4 },
      { type: "pong", at: 5 },
      { type: "error", error: "bad" },
    ];
    for (const ev of events) {
      expect(isResearchEvent(ev), JSON.stringify(ev)).toBe(true);
    }
  });

  it("rejects non-objects", () => {
    expect(isResearchEvent(null)).toBe(false);
    expect(isResearchEvent(undefined)).toBe(false);
    expect(isResearchEvent("stage.started")).toBe(false);
    expect(isResearchEvent(42)).toBe(false);
  });

  it("rejects objects with an unknown or missing type", () => {
    expect(isResearchEvent({})).toBe(false);
    expect(isResearchEvent({ type: "stage.unknown" })).toBe(false);
    expect(isResearchEvent({ stage: "live" })).toBe(false);
  });
});
