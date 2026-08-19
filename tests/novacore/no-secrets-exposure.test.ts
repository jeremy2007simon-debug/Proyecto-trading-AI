import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";

/**
 * Block 7 — every NovaCore adapter's output must be safe to send to the
 * frontend as-is. Sets fake, obviously-not-real credentials for this
 * suite (never the real env var names' actual values — this test never
 * reads a real secret) and asserts they never appear in ANY serialized
 * adapter output, even indirectly (e.g. inside an error message).
 */
describe("NovaCore — no secrets in adapter output", () => {
  const FAKE_KEY_ID = "AKFAKE_TEST_KEY_ID_00000000";
  const FAKE_SECRET = "FAKE_TEST_SECRET_VALUE_DO_NOT_LEAK_00000000";

  beforeEach(() => {
    process.env.ALPACA_PAPER_API_KEY_ID = FAKE_KEY_ID;
    process.env.ALPACA_PAPER_API_SECRET_KEY = FAKE_SECRET;
  });

  afterEach(() => {
    delete process.env.ALPACA_PAPER_API_KEY_ID;
    delete process.env.ALPACA_PAPER_API_SECRET_KEY;
  });

  it("BrokerHealth never contains the configured credential values", async () => {
    const health = await createAlpacaPaperBrokerAdapter().getHealth();
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain(FAKE_KEY_ID);
    expect(serialized).not.toContain(FAKE_SECRET);
  });

  it("the RS3M strategy, health, risk, and portfolio snapshots never contain the configured credential values", async () => {
    const [health, portfolio] = await Promise.all([getRs3mHealth(), getNovaCorePortfolioSnapshot()]);
    const { strategy } = getRs3mStrategy();
    const risk = getRs3mRiskSnapshot();

    const serialized = JSON.stringify({ health, portfolio, strategy, risk });
    expect(serialized).not.toContain(FAKE_KEY_ID);
    expect(serialized).not.toContain(FAKE_SECRET);
  });
});
