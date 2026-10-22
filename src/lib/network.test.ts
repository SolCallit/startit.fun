import { describe, expect, it, vi } from "vitest";

describe("network switch", () => {
  it("defaults to devnet and keeps per-row links on their own network", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "");
    const n = await import("./network");
    expect(n.NETWORK).toBe("devnet");
    expect(n.DB_NETWORK).toBe("solana-devnet");
    expect(n.WALLET_CHAIN).toBe("solana:devnet");
    expect(n.solscan("tx", "abc")).toBe("https://solscan.io/tx/abc?cluster=devnet");
    expect(n.solscan("tx", "abc", "solana-mainnet")).toBe("https://solscan.io/tx/abc");
  });

  it("switches everything with one setting", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "mainnet");
    const n = await import("./network");
    expect(n.IS_MAINNET).toBe(true);
    expect(n.DB_NETWORK).toBe("solana-mainnet");
    expect(n.WALLET_CHAIN).toBe("solana:mainnet");
    expect(n.explorer("address", "x")).toBe("https://explorer.solana.com/address/x");
    expect(n.solscan("tx", "old", "solana-devnet")).toBe("https://solscan.io/tx/old?cluster=devnet");
    vi.unstubAllEnvs();
  });
});
