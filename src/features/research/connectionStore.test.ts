import { beforeEach, describe, expect, it } from "vitest";

import { useConnectionStore } from "./connectionStore";

describe("useConnectionStore", () => {
  beforeEach(() => {
    useConnectionStore.getState().reset();
  });

  it("starts idle with no task", () => {
    const s = useConnectionStore.getState();
    expect(s.status).toBe("idle");
    expect(s.wsStatus).toBe("idle");
    expect(s.taskId).toBeNull();
  });

  it("setStatus updates status, wsStatus mirror, and taskId together", () => {
    useConnectionStore.getState().setStatus("open", "task-123");
    const s = useConnectionStore.getState();
    expect(s.status).toBe("open");
    expect(s.wsStatus).toBe("open");
    expect(s.taskId).toBe("task-123");
  });

  it("setStatus without a taskId clears the previous one", () => {
    useConnectionStore.getState().setStatus("open", "task-123");
    useConnectionStore.getState().setStatus("closed");
    const s = useConnectionStore.getState();
    expect(s.status).toBe("closed");
    expect(s.taskId).toBeNull();
  });

  it("reset returns the store to idle", () => {
    useConnectionStore.getState().setStatus("connecting", "task-9");
    useConnectionStore.getState().reset();
    const s = useConnectionStore.getState();
    expect(s.status).toBe("idle");
    expect(s.wsStatus).toBe("idle");
    expect(s.taskId).toBeNull();
  });
});
