export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse px-4 py-10 sm:py-14" aria-label="Loading your application">
      <div className="mb-8 flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-1.5 flex-1 rounded-full bg-start/50" />)}</div>
      <div className="glass h-[28rem] rounded-[28px]" />
    </div>
  );
}
