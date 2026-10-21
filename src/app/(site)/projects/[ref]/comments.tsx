"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { deleteComment, postComment, toggleLike } from "@/lib/community/actions";
import type { CommentView } from "@/lib/community/data";

function ago(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [d, u] of units) if (s >= d) return `${Math.floor(s / d)}${u} ago`;
  return "just now";
}

function Avatar({ name }: { name: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full text-[0.8125rem] font-extrabold text-white"
      style={{ background: `linear-gradient(140deg, hsl(${h} 70% 50%), hsl(${(h + 50) % 360} 70% 35%))` }}>
      {name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?"}
    </span>
  );
}

function Composer({ refId, parentId, onDone, autoFocus, placeholder }: { refId: string; parentId: string | null; onDone?: () => void; autoFocus?: boolean; placeholder: string }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(!!autoFocus);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    setErr(null);
    const r = await postComment(refId, text, parentId);
    if (!r.ok) { setErr(r.error); return; }
    setText(""); setFocused(false); onDone?.();
  });
  return (
    <div className="flex flex-col gap-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setFocused(true)} autoFocus={autoFocus}
        rows={focused ? 3 : 1} maxLength={1000} placeholder={placeholder}
        className="w-full resize-none border-b border-line-strong/70 bg-transparent px-1 py-2 text-ink placeholder:text-muted focus:border-cobalt focus:outline-none" />
      {focused ? (
        <div className="flex items-center justify-end gap-2">
          {err ? <p role="alert" className="mr-auto text-[0.8125rem] text-flagged">{err}</p> : <span className="mr-auto text-[0.75rem] text-muted">{text.length}/1000</span>}
          <button type="button" onClick={() => { setText(""); setFocused(false); onDone?.(); }} className="rounded-full px-3 py-1.5 text-[0.875rem] font-semibold text-ink-soft hover:text-ink">Cancel</button>
          <motion.button whileTap={{ scale: 0.94 }} type="button" disabled={pending || !text.trim()} onClick={submit} className="btn-start !py-1.5 !text-[0.875rem]">
            {pending ? "Posting…" : parentId ? "Reply" : "Comment"}
          </motion.button>
        </div>
      ) : null}
    </div>
  );
}

function Comment({ c, replies, refId, signedIn }: { c: CommentView; replies: CommentView[]; refId: string; signedIn: boolean }) {
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.likes);
  const [replying, setReplying] = useState(false);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const like = () => {
    if (!signedIn) return;
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    start(async () => { const r = await toggleLike(refId, c.id, next); if (!r.ok) { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); } });
  };
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <Avatar name={c.author} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem]"><span className="font-bold text-ink">@{c.author}</span> <span className="text-muted">{ago(c.created_at)}{c.edited_at ? " (edited)" : ""}</span></p>
        <p className="mt-0.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-ink">{c.body}</p>
        <div className="mt-1 flex items-center gap-1 text-[0.8125rem]">
          <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={like} disabled={!signedIn} aria-pressed={liked} title={signedIn ? "Like" : "Connect your wallet to like"}
            className={`flex items-center gap-1 rounded-full px-2 py-1 ${liked ? "text-start" : "text-ink-soft hover:text-ink"}`}>
            <svg viewBox="0 0 24 24" className="size-4" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M7 10v11H3V10h4Zm0 0 4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7" /></svg>
            {likes || ""}
          </motion.button>
          {signedIn && !c.parent_id ? <button type="button" onClick={() => setReplying((v) => !v)} className="rounded-full px-2.5 py-1 font-semibold text-ink-soft hover:text-ink">Reply</button> : null}
          {c.mine ? <button type="button" onClick={() => start(async () => { await deleteComment(refId, c.id); })} className="rounded-full px-2.5 py-1 text-muted hover:text-flagged">Delete</button> : null}
        </div>
        {replying ? <div className="mt-2"><Composer refId={refId} parentId={c.id} autoFocus placeholder="Add a reply…" onDone={() => { setReplying(false); setOpen(true); }} /></div> : null}
        {replies.length ? (
          <>
            <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 flex items-center gap-1 rounded-full px-2 py-1 text-[0.875rem] font-bold text-cobalt">
              <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span> {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 flex flex-col gap-4 overflow-hidden">
                  {replies.map((r) => <Comment key={r.id} c={r} replies={[]} refId={refId} signedIn={signedIn} />)}
                </motion.ul>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </div>
    </motion.li>
  );
}

/** YouTube-style thread: top comments or newest first, one level of replies, likes. */
export function Comments({ refId, comments, signedIn }: { refId: string; comments: CommentView[]; signedIn: boolean }) {
  const [sort, setSort] = useState<"top" | "new">("top");
  const { tops, byParent } = useMemo(() => {
    const byParent = new Map<string, CommentView[]>();
    for (const c of comments) if (c.parent_id) byParent.set(c.parent_id, [...(byParent.get(c.parent_id) ?? []), c]);
    for (const list of byParent.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const tops = comments.filter((c) => !c.parent_id).sort((a, b) =>
      sort === "new" ? b.created_at.localeCompare(a.created_at) : (b.likes + (byParent.get(b.id)?.length ?? 0)) - (a.likes + (byParent.get(a.id)?.length ?? 0)) || b.created_at.localeCompare(a.created_at));
    return { tops, byParent };
  }, [comments, sort]);

  return (
    <section aria-labelledby="comments-title" className="glass rounded-[20px] p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <h2 id="comments-title" className="text-[1.25rem] text-ink">{comments.length.toLocaleString()} {comments.length === 1 ? "comment" : "comments"}</h2>
        <div className="flex gap-1 rounded-full bg-surface-2/60 p-0.5 text-[0.8125rem]">
          {(["top", "new"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSort(s)} className={`rounded-full px-3 py-1 font-bold ${sort === s ? "bg-surface text-ink shadow-raise-sm" : "text-muted"}`}>{s === "top" ? "Top" : "Newest"}</button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {signedIn ? <Composer refId={refId} parentId={null} placeholder="Add a comment…" />
          : <p className="text-[0.9375rem] text-ink-soft"><Link href={`/login?next=/projects/${refId}`} className="font-bold text-cobalt hover:underline">Connect your wallet</Link> to join the conversation.</p>}
      </div>
      <ul className="mt-6 flex flex-col gap-5">
        {tops.map((c) => <Comment key={c.id} c={c} replies={byParent.get(c.id) ?? []} refId={refId} signedIn={signedIn} />)}
      </ul>
      {comments.length === 0 ? <p className="mt-2 text-muted">Quiet in here. First comment gets seen.</p> : null}
    </section>
  );
}
