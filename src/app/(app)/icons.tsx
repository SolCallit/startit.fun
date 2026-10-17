const s = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconHome = () => <svg {...s}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /></svg>;
export const IconGrid = () => <svg {...s}><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>;
export const IconRocket = () => <svg {...s}><path d="M5 15c-1.5 1-2 4-2 6 2 0 5-.5 6-2" /><path d="M9 15 5 11l4-1c3-5 7-7 11-7 0 4-2 8-7 11l-1 4Z" /><circle cx="15" cy="9" r="1.5" /></svg>;
export const IconFolder = () => <svg {...s}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>;
export const IconCoins = () => <svg {...s}><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M15 12.2c3.4.2 6 1.4 6 2.8 0 1.7-2.7 3-6 3-1.6 0-3-.3-4.1-.8" /></svg>;
export const IconShield = () => <svg {...s}><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>;
export const IconInbox = () => <svg {...s}><path d="M4 13h4l2 3h4l2-3h4" /><path d="M5 5h14l1 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" /></svg>;
