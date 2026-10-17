import { describe, expect, it } from "vitest";
import { launchConfigSchema, parseAllocations, wholeToRaw } from "./config";

const A = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", B = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", C = "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH";
const base = {
  platform_bps: "1500", founder_bps: "3000", launcher_bps: "500", community_bps: "5000", deviation_reason: "",
  founder_wallet: A, launcher_wallet: B, treasury_address: C, treasury_is_multisig: "yes", treasury_threshold: "2",
  treasury_signers: `${A}\n${B}\n${C}`, treasury_rules: "Any spend needs 2 of 3 signers and a public post.", insider_allocations: "",
};

describe("launchConfigSchema", () => {
  it("accepts a complete scout launch", () => expect(launchConfigSchema.safeParse(base).success).toBe(true));
  it("requires a launcher wallet when the launcher has a share", () => {
    expect(launchConfigSchema.safeParse({ ...base, launcher_wallet: "" }).success).toBe(false);
  });
  it("rejects a launcher wallet on a self-launch", () => {
    expect(launchConfigSchema.safeParse({ ...base, platform_bps: "2000", launcher_bps: "0" }).success).toBe(false);
  });
  it("rejects bad multisig shapes", () => {
    expect(launchConfigSchema.safeParse({ ...base, treasury_threshold: "1" }).success).toBe(false);
    expect(launchConfigSchema.safeParse({ ...base, treasury_threshold: "4" }).success).toBe(false);
    expect(launchConfigSchema.safeParse({ ...base, treasury_signers: `${A}\n${A}` }).success).toBe(false);
  });
  it("rejects invalid addresses", () => expect(launchConfigSchema.safeParse({ ...base, founder_wallet: "0xabc" }).success).toBe(false));
});

describe("helpers", () => {
  it("parses allocations", () => {
    expect(parseAllocations("")).toEqual([]);
    expect(parseAllocations("Team | 1000 | 12-month lock")).toEqual([{ holder: "Team", amount: "1000", note: "12-month lock" }]);
    expect(parseAllocations("Team | lots | ?")).toBeNull();
  });
  it("converts whole tokens to raw units", () => expect(wholeToRaw("1000000000", 6)).toBe("1000000000000000"));
});
