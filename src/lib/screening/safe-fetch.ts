import "server-only";
import { createHash } from "node:crypto";
import { Agent, fetch as undiciFetch } from "undici";
import { assertSafeUrl, guardedLookup, UnsafeUrlError } from "./net-guard";

export type FetchedSource = {
  requestedUrl: string;
  url: string; // final URL after redirects
  status: number;
  fetchedAt: string;
  contentType: string;
  sha256: string;
  text: string;
  truncated: boolean;
};

const agent = new Agent({
  connect: { lookup: guardedLookup as never, timeout: 5_000 },
  headersTimeout: 10_000,
  bodyTimeout: 10_000,
});

const ALLOWED_TYPES = ["text/html", "text/plain", "text/markdown", "application/json", "application/xhtml+xml"];
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

/** Fetches an untrusted URL with SSRF protection, redirect re-validation, size and time limits. */
export async function safeFetch(input: string, init: { accept?: string } = {}): Promise<FetchedSource> {
  let url = assertSafeUrl(input);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await undiciFetch(url, {
      dispatcher: agent,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        accept: init.accept ?? "text/html,text/plain;q=0.9,*/*;q=0.1",
        "user-agent": "StartitScreeningBot/1.0 (+https://startit.fun/methodology)",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new UnsafeUrlError(`Redirect without a location from ${url.href}`);
      url = assertSafeUrl(new URL(loc, url));
      continue;
    }

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const fetchedAt = new Date().toISOString();
    if (!ALLOWED_TYPES.includes(contentType)) {
      await res.body?.cancel();
      return { requestedUrl: input, url: url.href, status: res.status, fetchedAt, contentType, sha256: "", text: "", truncated: false };
    }

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          chunks.push(value.subarray(0, value.byteLength - (size - MAX_BYTES)));
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks);
    return {
      requestedUrl: input,
      url: url.href,
      status: res.status,
      fetchedAt,
      contentType,
      sha256: createHash("sha256").update(buf).digest("hex"),
      text: buf.toString("utf8"),
      truncated,
    };
  }
  throw new UnsafeUrlError(`Too many redirects from ${input}`);
}

/** Crude but safe HTML → text: drops scripts/styles/comments, keeps link targets we care about. */
export function htmlToText(html: string, max = 12_000): { title: string; text: string; links: string[] } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!).filter((h) => /^https?:\/\//i.test(h)).slice(0, 200);
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return { title, text, links: [...new Set(links)] };
}
