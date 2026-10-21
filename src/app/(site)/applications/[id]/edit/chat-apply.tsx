"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { chatTurn, type ChatMsg } from "@/lib/applications/chat";
import { ImagePicker, ProofPicker } from "./step-form";

const LABEL: Record<string, string> = {
  project_name: "Product", token_name: "Coin", ticker: "Ticker", project_summary: "About",
  website: "Website", x: "X", github: "GitHub", telegram: "Telegram", discord: "Discord",
};

/** Apply by talking: the AI asks, fills the same draft as the form, and the same review applies. */
export function ChatApply({ appId, available, initialChat, saved, imageUrl, proofs }: {
  appId: string; available: boolean; initialChat: ChatMsg[]; saved: Record<string, string>;
  imageUrl: string | null; proofs: { id: string; kb: number; mime: string }[];
}) {
  const router = useRouter();
  const opener: ChatMsg = { role: "ai", text: "gm! What product or brand are we launching a meme for? Drop the name and a line on what it does." };
  const [msgs, setMsgs] = useState<ChatMsg[]>(initialChat.length ? initialChat : [opener]);
  const [fields, setFields] = useState(saved);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, pending]);

  const send = () => {
    const t = text.trim();
    if (!t || pending) return;
    const history = msgs;
    setMsgs([...history, { role: "user", text: t }]);
    setText("");
    setErr(null);
    start(async () => {
      const r = await chatTurn(appId, history, t);
      if (!r.ok) { setErr(r.error); return; }
      setMsgs((m) => [...m, { role: "ai", text: r.reply }]);
      if (Object.keys(r.captured).length) setFields((f) => ({ ...f, ...r.captured }));
    });
  };

  if (!available) {
    return (
      <div className="glass rounded-[28px] p-6 text-center">
        <p className="font-display text-[1.25rem] font-extrabold text-ink">The AI chat is switching on soon</p>
        <p className="mt-2 text-ink-soft">Until then, use Fill it in. It&apos;s three quick screens, and the same review applies either way.</p>
      </div>
    );
  }

  const got = Object.entries(fields).filter(([k, v]) => LABEL[k] && v);
  return (
    <div className="glass flex flex-col gap-5 rounded-[28px] p-4 sm:p-6">
      <div className="flex max-h-[26rem] min-h-[16rem] flex-col gap-2.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`max-w-[85%] rounded-[18px] px-4 py-2.5 text-[0.9375rem] leading-relaxed ${m.role === "user" ? "self-end rounded-br-md bg-start text-start-ink" : "self-start rounded-bl-md bg-surface-2/80 text-ink"}`}>
              {m.text}
            </motion.div>
          ))}
          {pending ? (
            <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-start rounded-[18px] bg-surface-2/80 px-4 py-2.5 text-muted">
              <span className="inline-flex gap-1">{[0, 1, 2].map((d) => <motion.span key={d} className="size-1.5 rounded-full bg-muted" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: d * 0.12 }} />)}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer…" aria-label="Your message" maxLength={1500}
          className="min-w-0 flex-1 rounded-full border border-line-strong/80 bg-surface/70 px-4 py-3 text-ink placeholder:text-muted focus:border-cobalt focus:outline-none" />
        <motion.button whileTap={{ scale: 0.92 }} type="submit" disabled={pending || !text.trim()} className="btn-start">Send</motion.button>
      </form>
      {err ? <p role="alert" className="text-[0.875rem] text-flagged">{err}</p> : null}

      {got.length ? (
        <div className="rounded-[16px] border border-line/70 bg-surface/40 p-3">
          <p className="text-[0.8125rem] font-semibold text-ink">Saved to your application</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-[0.8125rem] sm:grid-cols-2">
            {got.map(([k, v]) => (
              <div key={k} className="flex min-w-0 gap-2"><dt className="shrink-0 text-muted">{LABEL[k]}</dt><dd className="truncate text-ink">{k === "ticker" ? `$${v}` : v}</dd></div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <ImagePicker appId={appId} initial={imageUrl} />
        <ProofPicker appId={appId} proofs={proofs} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line/70 pt-5">
        <button type="button" className="btn-start" onClick={() => { router.push(`/applications/${appId}/edit?step=1&mode=form`); router.refresh(); }}>
          Review and continue
        </button>
        <p className="text-[0.8125rem] text-muted">You&apos;ll see everything the AI filled in, then pick the fee split.</p>
      </div>
    </div>
  );
}
