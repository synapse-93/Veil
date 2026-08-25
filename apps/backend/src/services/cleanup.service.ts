import type { FastifyInstance } from "fastify";
import type { CapsuleRepository } from "../repository/capsule.repository.js";

export class CleanupService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly repo: CapsuleRepository, private readonly intervalMs: number = 60_000) {}

  start(app: FastifyInstance): void {
    if (this.timer) return; // already started

    // Scheduled runner
    this.timer = setInterval(() => {
      // Fire-and-forget; prevent overlapping executions
      void this.runOnce();
    }, this.intervalMs);
    // Ensure timer does not keep the process alive if app is shutting down
    this.timer.unref();

    // Clear timer on Fastify close/shutdown
    app.addHook("onClose", async () => {
      if (this.timer) {
        clearInterval(this.timer as NodeJS.Timeout);
        this.timer = null;
      }
    });
  }

  async runOnce(): Promise<void> {
    if (this.running) return; // avoid overlap
    this.running = true;
    try {
      await this.repo.expireStale();
    } catch (err) {
      // Do not crash the server on cleanup failure. Log if console is available.
      try {
        // eslint-disable-next-line no-console
        console.error("CleanupService: expireStale failed:", String(err));
      } catch (_) {
        // swallow
      }
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

