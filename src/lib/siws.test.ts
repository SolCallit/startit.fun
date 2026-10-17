import { describe, expect, it } from "vitest";
import { buildSiwsMessage } from "./siws";

describe("buildSiwsMessage", () => {
  it("uses the standard field order wallets expect", () => {
    const msg = buildSiwsMessage({
      domain: "startit-fun.vercel.app",
      address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      statement: "Sign in to Startit.fun.",
      uri: "https://startit-fun.vercel.app/login",
      issuedAt: "2026-10-17T04:30:00.000Z",
    });
    expect(msg).toBe(
      "startit-fun.vercel.app wants you to sign in with your Solana account:\n" +
        "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\n\n" +
        "Sign in to Startit.fun.\n\n" +
        "URI: https://startit-fun.vercel.app/login\nVersion: 1\nIssued At: 2026-10-17T04:30:00.000Z",
    );
    expect(msg.indexOf("URI:")).toBeLessThan(msg.indexOf("Version:"));
  });
  it("rejects multi-line statements", () => {
    expect(() => buildSiwsMessage({ domain: "a.b", address: "x", statement: "a\nb", uri: "https://a.b", issuedAt: "t" })).toThrow();
  });
});
