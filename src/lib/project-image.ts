/** Public URL of a project's uploaded image (the coin's image). Safe on client and server. */
export function projectImageUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/project-images/${path}`;
}
