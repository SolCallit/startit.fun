/**
 * The screen is the START button: a chrome bezel hugs the viewport edges and carries the logo's
 * light segments where the logo has them (green on the left, cyan top-right, yellow bottom-right).
 * Content sits inside the bezel; nothing crosses it. Fixed, static, decorative.
 */
export function Backdrop() {
  const cx = 720, cy = 450, rx = 790, ry = 540;
  const pt = (deg: number) => [cx + rx * Math.cos((deg * Math.PI) / 180), cy + ry * Math.sin((deg * Math.PI) / 180)];
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rx} ${ry} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const segments = [
    { d: arc(198, 232), color: "var(--glow-a)" }, // green, upper left
    { d: arc(146, 172), color: "var(--glow-a)" }, // green, lower left
    { d: arc(292, 330), color: "var(--glow-b)" }, // cyan, upper right
    { d: arc(18, 50), color: "var(--glow-c)" },   // yellow, lower right
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full opacity-[var(--ring-opacity)]" viewBox="0 0 1440 900" preserveAspectRatio="none">
        <defs>
          <filter id="bd-glow" filterUnits="userSpaceOnUse" x="-300" y="-300" width="2040" height="1500"><feGaussianBlur stdDeviation="18" /></filter>
        </defs>
        <ellipse cx={cx} cy={cy} rx={rx + 14} ry={ry + 14} fill="none" stroke="var(--chrome-hi)" strokeOpacity="0.35" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <ellipse cx={cx} cy={cy} rx={rx - 14} ry={ry - 14} fill="none" stroke="var(--chrome-lo)" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {segments.map((s, i) => (
          <g key={i}>
            <path d={s.d} stroke={s.color} strokeWidth="40" strokeLinecap="round" fill="none" filter="url(#bd-glow)" opacity="0.55" />
            <path d={s.d} stroke={s.color} strokeWidth="6" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
    </div>
  );
}
