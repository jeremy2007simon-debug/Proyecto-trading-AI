import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getMarketBenchmarkSeries } from "@/novacore/market-context/adapters/market-benchmark-adapter";
import { getMarketMovers } from "@/novacore/market-context/adapters/market-movers-adapter";
import { getSpyBenchmarkSeries } from "@/novacore/market-context/adapters/spy-benchmark-adapter";
import { getMarketNews } from "@/novacore/market-news/adapters/get-market-news";
import { buildNovaCoreNotifications } from "@/novacore/notifications/build-notifications";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getRs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";
import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";

/**
 * Block 7 / Observability Upgrade — every NovaCore adapter's output must
 * be safe to send to the frontend as-is. Sets fake, obviously-not-real
 * credentials for BOTH credential domains this codebase has (RS3M Trading
 * API and Market Data API) and asserts they never appear in ANY
 * serialized adapter output, even indirectly (e.g. inside an error
 * message).
 */
describe("NovaCore — no secrets in adapter output", () => {
  const FAKE_KEY_ID = "AKFAKE_TEST_KEY_ID_00000000";
  const FAKE_SECRET = "FAKE_TEST_SECRET_VALUE_DO_NOT_LEAK_00000000";
  const FAKE_MARKET_KEY_ID = "AKFAKE_MARKET_KEY_ID_00000000";
  const FAKE_MARKET_SECRET = "FAKE_MARKET_SECRET_DO_NOT_LEAK_00000000";

  beforeEach(() => {
    process.env.ALPACA_PAPER_API_KEY_ID = FAKE_KEY_ID;
    process.env.ALPACA_PAPER_API_SECRET_KEY = FAKE_SECRET;
    process.env.ALPACA_API_KEY_ID = FAKE_MARKET_KEY_ID;
    process.env.ALPACA_API_SECRET_KEY = FAKE_MARKET_SECRET;
  });

  afterEach(() => {
    delete process.env.ALPACA_PAPER_API_KEY_ID;
    delete process.env.ALPACA_PAPER_API_SECRET_KEY;
    delete process.env.ALPACA_API_KEY_ID;
    delete process.env.ALPACA_API_SECRET_KEY;
  });

  it("BrokerHealth never contains the configured credential values", async () => {
    const health = await createAlpacaPaperBrokerAdapter().getHealth();
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain(FAKE_KEY_ID);
    expect(serialized).not.toContain(FAKE_SECRET);
  });

  it("the RS3M strategy, health, risk, portfolio, execution, guards, and signal snapshots never contain the configured credential values", async () => {
    const [health, portfolio, risk, execution, safety] = await Promise.all([getRs3mHealth(), getNovaCorePortfolioSnapshot(), getRs3mRiskSnapshot(), getRs3mExecutionSnapshot(), getRs3mExecutionSafety()]);
    const { strategy } = getRs3mStrategy();
    const signal = getRs3mCurrentSignal();

    const serialized = JSON.stringify({ health, portfolio, strategy, risk, execution, safety, signal });
    expect(serialized).not.toContain(FAKE_KEY_ID);
    expect(serialized).not.toContain(FAKE_SECRET);
  });

  it("the SPY benchmark series never contains the Market Data API credential values", async () => {
    const series = await getSpyBenchmarkSeries("1M");
    const serialized = JSON.stringify(series);
    expect(serialized).not.toContain(FAKE_MARKET_KEY_ID);
    expect(serialized).not.toContain(FAKE_MARKET_SECRET);
  });

  it("the multi-market benchmark series and movers list never contain the Market Data API credential values", async () => {
    const [series, movers] = await Promise.all([getMarketBenchmarkSeries("NASDAQ100", "1D"), getMarketMovers()]);
    const serialized = JSON.stringify({ series, movers });
    expect(serialized).not.toContain(FAKE_MARKET_KEY_ID);
    expect(serialized).not.toContain(FAKE_MARKET_SECRET);
  });

  it("Market News (reuses the Market Data credentials) never leaks them, even in the unavailable-reason message", async () => {
    const news = await getMarketNews();
    const serialized = JSON.stringify(news);
    expect(serialized).not.toContain(FAKE_MARKET_KEY_ID);
    expect(serialized).not.toContain(FAKE_MARKET_SECRET);
  });

  it("Notifications (built from health/guards/activity, transitively touching both credential domains) never leak either", async () => {
    const notifications = await buildNovaCoreNotifications();
    const serialized = JSON.stringify(notifications);
    expect(serialized).not.toContain(FAKE_KEY_ID);
    expect(serialized).not.toContain(FAKE_SECRET);
    expect(serialized).not.toContain(FAKE_MARKET_KEY_ID);
    expect(serialized).not.toContain(FAKE_MARKET_SECRET);
  });
});
