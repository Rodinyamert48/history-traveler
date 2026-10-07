/** Yields to the browser so long procedural builds don't freeze the loading UI. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves with the JSON at a path relative to the deployed site root (GitHub Pages safe). */
export async function fetchJson<T>(relativePath: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${relativePath.replace(/^\//, "")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} while loading ${url}`);
  return (await res.json()) as T;
}

export function assetUrl(relativePath: string): string {
  return `${import.meta.env.BASE_URL}${relativePath.replace(/^\//, "")}`;
}
