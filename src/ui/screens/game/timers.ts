interface Job {
  fn: () => void;
  left: number;
  due: number;
  id: ReturnType<typeof setTimeout> | null;
}

/** One-shot timers that the Quit dialog can pause and resume, so nothing plays out behind it. */
export class Timers {
  private jobs = new Set<Job>();
  private paused = false;
  later(fn: () => void, ms: number) {
    const job: Job = { fn, left: ms, due: 0, id: null };
    this.jobs.add(job);
    if (!this.paused) this.arm(job);
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    const now = performance.now();
    for (const job of this.jobs) {
      if (job.id !== null) clearTimeout(job.id);
      job.id = null;
      job.left = Math.max(0, job.due - now);
    }
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const job of this.jobs) this.arm(job);
  }
  clear() {
    for (const job of this.jobs) if (job.id !== null) clearTimeout(job.id);
    this.jobs.clear();
  }
  private arm(job: Job) {
    job.due = performance.now() + job.left;
    job.id = setTimeout(() => {
      this.jobs.delete(job);
      job.fn();
    }, job.left);
  }
}
