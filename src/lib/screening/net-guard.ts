import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF protection. Every outbound request made on behalf of an application must:
 *  - be https on port 443, with no credentials in the URL
 *  - use a DNS name (no IP literals, no single-label/internal names)
 *  - resolve only to public unicast addresses — checked at connect time, so DNS rebinding
 *    between validation and connection can't reach an internal address
 */

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

const v4ToInt = (ip: string) => ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;

function v4Blocked(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

function expandV6(ip: string): number[] | null {
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  let tail: number[] = [];
  const v4 = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]!);
    tail = [n >>> 16, n & 0xffff];
    ip = ip.slice(0, -v4[1]!.length) + "0:0";
  }
  const [head, rest] = ip.split("::");
  const h = head ? head.split(":").filter(Boolean) : [];
  const r = rest !== undefined ? (rest ? rest.split(":").filter(Boolean) : []) : null;
  const groups = r === null ? h : [...h, ...Array(8 - h.length - r.length).fill("0"), ...r];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  if (tail.length) { nums[6] = tail[0]!; nums[7] = tail[1]!; }
  return nums;
}

function v6Blocked(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return true;
  const allZeroPrefix = g.slice(0, 5).every((x) => x === 0);
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (allZeroPrefix && (g[5] === 0xffff || g[5] === 0)) {
    // IPv4-mapped / IPv4-compatible: judge the embedded IPv4
    const v4 = `${g[6]! >>> 8}.${g[6]! & 255}.${g[7]! >>> 8}.${g[7]! & 255}`;
    return v4Blocked(v4);
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g[0]! & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true; // NAT64 → could reach internal v4
  return false;
}

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !v4Blocked(ip);
  if (family === 6) return !v6Blocked(ip);
  return false;
}

export class UnsafeUrlError extends Error {}

export function assertSafeUrl(input: string | URL): URL {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new UnsafeUrlError("Not a valid URL.");
  }
  if (u.protocol !== "https:") throw new UnsafeUrlError("Only https:// URLs are fetched.");
  if (u.username || u.password) throw new UnsafeUrlError("URLs with credentials are refused.");
  if (u.port && u.port !== "443") throw new UnsafeUrlError("Only the default https port is allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) throw new UnsafeUrlError("IP-address URLs are refused; use a domain name.");
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost") || host === "localhost") {
    throw new UnsafeUrlError("Internal hostnames are refused.");
  }
  return u;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void;

/** dns.lookup replacement used at socket-connect time. */
export function guardedLookup(hostname: string, options: { all?: boolean } & object, cb: LookupCb) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = addresses as { address: string; family: number }[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      const e = new Error(`Refused: ${hostname} resolves to a non-public address.`) as NodeJS.ErrnoException;
      e.code = "ESSRF";
      return cb(e, []);
    }
    if (options.all) cb(null, list);
    else cb(null, list[0]!.address, list[0]!.family);
  });
}
