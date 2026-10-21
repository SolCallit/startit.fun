/** Re-mounts on every navigation, so each page slides in. */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
