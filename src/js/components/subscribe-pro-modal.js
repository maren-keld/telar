/** Stub repo público — modal Pro solo en instalador oficial. */
export function openSubscribeProModal() {}
export async function requireProOrSubscribe({ onAllowed }) {
  onAllowed?.();
  return true;
}
