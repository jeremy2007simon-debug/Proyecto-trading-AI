import { describe, expect, it } from "vitest";
import { getResearchProjectById, listResearchProjects } from "@/novacore/research-lab/adapters/block-research-adapter";

describe("NovaCore Research Lab", () => {
  it("lists all transcribed research projects", () => {
    const projects = listResearchProjects();
    expect(projects.map((p) => p.id).sort()).toEqual(["ETF_ROTATION_RESEARCH", "FOREX_RESEARCH_V1", "SP500_LEGACY_STRATEGY_RESEARCH"]);
  });

  it("every project's rejected + research + candidates sums to its hypothesesTotal (internal consistency)", () => {
    for (const project of listResearchProjects()) {
      expect(project.rejected + project.research + project.candidates).toBe(project.hypothesesTotal);
    }
  });

  it("ETF_ROTATION_RESEARCH matches the Block 5 report's published funnel result (1 CANDIDATE, 1 RESEARCH, 22 REJECTED)", () => {
    const project = getResearchProjectById("ETF_ROTATION_RESEARCH");
    expect(project?.hypothesesTotal).toBe(24);
    expect(project?.rejected).toBe(22);
    expect(project?.research).toBe(1);
    expect(project?.candidates).toBe(1);
  });

  it("FOREX_RESEARCH_V1 matches the Block 8 report's published funnel result (0 CANDIDATE, 0 RESEARCH, 29 REJECTED)", () => {
    const project = getResearchProjectById("FOREX_RESEARCH_V1");
    expect(project?.hypothesesTotal).toBe(29);
    expect(project?.rejected).toBe(29);
    expect(project?.research).toBe(0);
    expect(project?.candidates).toBe(0);
  });

  it("every project cites a source document — no invented numbers", () => {
    for (const project of listResearchProjects()) {
      expect(project.sourceDoc).toMatch(/docs\//);
    }
  });

  it("getResearchProjectById returns undefined for an unknown id", () => {
    expect(getResearchProjectById("NOT_A_REAL_PROJECT")).toBeUndefined();
  });
});
