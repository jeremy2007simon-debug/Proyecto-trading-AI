import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";

describe("NovaCore BrokerAdapter — Alpaca paper (read-only)", () => {
  const originalKeyId = process.env.ALPACA_PAPER_API_KEY_ID;
  const originalSecret = process.env.ALPACA_PAPER_API_SECRET_KEY;

  beforeEach(() => {
    delete process.env.ALPACA_PAPER_API_KEY_ID;
    delete process.env.ALPACA_PAPER_API_SECRET_KEY;
  });

  afterEach(() => {
    if (originalKeyId === undefined) delete process.env.ALPACA_PAPER_API_KEY_ID;
    else process.env.ALPACA_PAPER_API_KEY_ID = originalKeyId;
    if (originalSecret === undefined) delete process.env.ALPACA_PAPER_API_SECRET_KEY;
    else process.env.ALPACA_PAPER_API_SECRET_KEY = originalSecret;
  });

  it("reports credentialsConfigured: false without ever exposing a credential value, when unset", async () => {
    const health = await createAlpacaPaperBrokerAdapter().getHealth();
    expect(health.credentialsConfigured).toBe(false);
    expect(health.status).toBe("WARNING");
    expect(JSON.stringify(health)).not.toMatch(/key|secret[^\s]*:/i);
  });

  it("fails closed (never throws, never fabricates data) on every read when credentials are missing", async () => {
    const broker = createAlpacaPaperBrokerAdapter();
    const [account, positions, orders] = await Promise.all([broker.getAccount(), broker.getPositions(), broker.getOrders()]);
    expect(account.ok).toBe(false);
    expect(positions.ok).toBe(false);
    expect(orders.ok).toBe(false);
    if (!account.ok) expect(account.error.code).toBe("CREDENTIALS_NOT_CONFIGURED");
  });

  it("exposes no order-submission method at all — the interface itself cannot place an order", () => {
    const broker = createAlpacaPaperBrokerAdapter() as unknown as Record<string, unknown>;
    expect(broker.submitNotionalOrder).toBeUndefined();
    expect(broker.submitOrder).toBeUndefined();
  });

  it("is scoped to PAPER, never LIVE", () => {
    expect(createAlpacaPaperBrokerAdapter().environment).toBe("PAPER");
  });
});
