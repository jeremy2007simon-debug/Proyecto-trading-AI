import "server-only";

import { getResearchEvents } from "@/novacore/events/adapters/research-event-adapter";
import { getRs3mEvents } from "@/novacore/events/adapters/rs3m-event-adapter";
import { getCaShadowEvents } from "@/novacore/events/adapters/ca-shadow-event-adapter";
import { getDailyReportEvents } from "@/novacore/reports/daily-close/daily-report-event-adapter";
import type { NovaCoreEvent, NovaCoreEventDomain } from "@/novacore/events/types";

/**
 * Block 7, section 12 — NovaCore Activity Feed. Merges every registered
 * event adapter's output into one chronological timeline. Adding a new
 * event source later (Block 8's Prop Firm research, a second strategy's
 * execution events, ...) means adding one more adapter call here — this
 * function does not know or care how any adapter derives its events.
 */
export interface ActivityFeedOptions {
  domain?: NovaCoreEventDomain;
  limit?: number;
}

export function buildActivityFeed(options: ActivityFeedOptions = {}): NovaCoreEvent[] {
  const all: NovaCoreEvent[] = [...getRs3mEvents(), ...getResearchEvents(), ...getCaShadowEvents(), ...getDailyReportEvents()];

  const filtered = options.domain ? all.filter((e) => e.domain === options.domain) : all;
  const sorted = [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return options.limit ? sorted.slice(0, options.limit) : sorted;
}
