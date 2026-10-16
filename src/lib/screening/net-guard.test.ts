import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPublicAddress, UnsafeUrlError } from "./net-guard";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:7f00:1", "64:ff9b::a00:1", "2001:db8::1",
  ])("blocks %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["8.8.8.8", "1.1.1.1", "140.82.112.3", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe("assertSafeUrl", () => {
  it.each([
    "http://example.com", "https://127.0.0.1/", "https://[::1]/", "https://169.254.169.254/latest/meta-data",
    "https://localhost/", "https://intranet/", "https://foo.internal/", "https://user:pw@example.com/",
    "https://example.com:8443/", "file:///etc/passwd", "gopher://example.com", "not a url",
  ])("refuses %s", (u) => expect(() => assertSafeUrl(u)).toThrow(UnsafeUrlError));

  it("accepts a normal https URL", () => {
    expect(assertSafeUrl("https://docs.example.com/a?b=c").hostname).toBe("docs.example.com");
  });
});
