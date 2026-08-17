/**
 * Block 5 — shared progress-logging helper for standalone research
 * scripts. Extracted so `formatDuration` isn't re-implemented a third
 * time (Block 4.5's `run-strategy-research.ts` had its own inline copy).
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export interface ProgressTickInfo {
  stage: string;
  strategy?: string;
  asset?: string;
  timeframe?: string;
  cost?: string;
}

/**
 * Produces lines in the exact format requested for Block 5:
 * `[Block 5] Stage 3 | 42/138 experiments | Volatility Breakout | QQQ | 15m | 2bps | elapsed 00:31:20 | ETA 01:12:00`
 */
export function createProgressLogger(total: number) {
  const startTime = Date.now();
  let completed = 0;

  return {
    log(info: ProgressTickInfo, options: { increment?: boolean } = {}): void {
      if (options.increment !== false) completed += 1;
      const elapsedMs = Date.now() - startTime;
      const pct = total > 0 ? (completed / total) * 100 : 100;
      const etaMs = completed > 0 && completed < total ? (elapsedMs / completed) * (total - completed) : 0;
      const parts = [info.stage, `${completed}/${total} experiments (${pct.toFixed(1)}%)`, info.strategy, info.asset, info.timeframe, info.cost].filter(
        (p): p is string => p !== undefined,
      );
      console.log(`[Block 5] ${parts.join(" | ")} | elapsed ${formatDuration(elapsedMs)} | ETA ${formatDuration(etaMs)}`);
    },
    get completed(): number {
      return completed;
    },
  };
}
