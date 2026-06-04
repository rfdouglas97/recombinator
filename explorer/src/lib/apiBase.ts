/** Production: set VITE_API_URL=https://your-api.up.railway.app (no trailing slash). */
const origin = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p}`;
}
