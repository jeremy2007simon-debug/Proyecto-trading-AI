import type { NovaCoreEvent } from "@/novacore/events/types";
import { listResearchProjects } from "@/novacore/research-lab/adapters/block-research-adapter";

/**
 * Block 7 — one `RESEARCH_EXPERIMENT_COMPLETED` event per completed
 * research project (transcribed from each project's `createdAt`/notes —
 * see `block-research-adapter.ts`), plus one `CANDIDATE_CREATED` event
 * for RS3M, the only candidate any research project has produced so far.
 */
export function getResearchEvents(): NovaCoreEvent[] {
  const events: NovaCoreEvent[] = [];

  for (const project of listResearchProjects()) {
    events.push({
      id: `research-completed-${project.id}`,
      type: "RESEARCH_EXPERIMENT_COMPLETED",
      domain: "research",
      timestamp: `${project.createdAt}T00:00:00.000Z`,
      summary: `${project.name} completed — ${project.hypothesesTotal} hypotheses tested, ${project.rejected} rejected, ${project.research} in research, ${project.candidates} candidate(s).`,
      sourceDoc: project.sourceDoc,
    });

    if (project.candidates > 0 && project.id === "ETF_ROTATION_RESEARCH") {
      events.push({
        id: `candidate-created-RS3M_CANDIDATE_V1`,
        type: "CANDIDATE_CREATED",
        domain: "research",
        timestamp: "2026-08-17T09:19:00.000Z",
        strategyId: "RS3M_CANDIDATE_V1",
        summary: "RS3M_CANDIDATE_V1 (Relative Strength, 3-month lookback) promoted from ETF_ROTATION_RESEARCH's single CANDIDATE to a frozen candidate definition.",
        sourceDoc: "docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md §8-10; docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md §2",
      });
    }
  }

  return events;
}
