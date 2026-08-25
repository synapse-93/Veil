import Fastify from "fastify";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CleanupService } from "./cleanup.service.js";

describe("CleanupService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("invokes expireStale periodically and prevents overlap", async () => {
    // Controlled promises to simulate long-running expireStale calls without relying
    // on nested setTimeouts and fake timers.
    const resolves: Array<() => void> = [];
    const calls: number[] = [];
    const repo: any = {
      expireStale: vi.fn(() => {
        calls.push(Date.now());
        return new Promise<void>((res) => {
          resolves.push(res);
        });
      }),
    };

    const app = Fastify();
    const svc = new CleanupService(repo, 100);
    svc.start(app);

    // advance to first tick
    vi.advanceTimersByTime(120);
    await Promise.resolve();
    expect(repo.expireStale).toHaveBeenCalledTimes(1);

    // advance to second tick while first is still unresolved; should NOT call again
    vi.advanceTimersByTime(120);
    await Promise.resolve();
    expect(repo.expireStale).toHaveBeenCalledTimes(1);

    // resolve first
    resolves.shift()?.();
    // allow promise resolution microtasks
    await Promise.resolve();

    // advance to next tick where second call should occur
    vi.advanceTimersByTime(120);
    await Promise.resolve();
    expect(repo.expireStale).toHaveBeenCalledTimes(2);

    // resolve second and cleanup
    resolves.shift()?.();
    await app.close();
  });

  it("stop clears timer on Fastify shutdown and failures do not crash", async () => {
    const repo: any = {
      expireStale: vi.fn(async () => {
        throw new Error("db down");
      }),
    };

    const app = Fastify();
    const svc = new CleanupService(repo, 100);
    svc.start(app);

    vi.advanceTimersByTime(150);
    // allow the scheduled handler to run
    await Promise.resolve();
    expect(repo.expireStale).toHaveBeenCalledTimes(1);

    // Closing app should clear timer; advance further time shouldn't call again
    await app.close();
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(repo.expireStale).toHaveBeenCalledTimes(1);
  });
});
