import { describe, expect, it } from "vitest";
import { walletOf } from "./wallet-identity";

const ADDR = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("walletOf", () => {
  it("reads the address from a web3 identity", () => {
    expect(walletOf({ identities: [{ provider: "web3", identity_data: { address: ADDR, chain: "solana" } }] })).toBe(ADDR);
  });
  it("falls back to the sub claim", () => {
    expect(walletOf({ user_metadata: { sub: `web3:solana:${ADDR}` } })).toBe(ADDR);
    expect(walletOf({ user_metadata: { custom_claims: { address: ADDR } } })).toBe(ADDR);
  });
  it("ignores email accounts, other chains and junk", () => {
    expect(walletOf({ identities: [{ provider: "email", identity_data: { email: "a@b.co" } }] })).toBeNull();
    expect(walletOf({ identities: [{ provider: "web3", identity_data: { address: "0xabc", chain: "ethereum" } }] })).toBeNull();
    expect(walletOf({ user_metadata: { sub: "web3:solana:not-an-address!" } })).toBeNull();
  });
});
