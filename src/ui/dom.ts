/** Tiny DOM helpers — UI elements are created once and only mutated when values change. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  parent?: HTMLElement,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  parent?.appendChild(node);
  return node;
}

/** Sets textContent only if it changed (avoids layout thrash in per-frame HUD updates). */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setVisible(node: HTMLElement, visible: boolean): void {
  const hidden = node.classList.contains("hidden");
  if (visible && hidden) node.classList.remove("hidden");
  else if (!visible && !hidden) node.classList.add("hidden");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export const EMBLEM_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<circle cx="50" cy="50" r="46" fill="none" stroke="#d8ad48" stroke-width="1.5"/>
<circle cx="50" cy="50" r="40" fill="none" stroke="#d8ad48" stroke-width="0.6" stroke-dasharray="2 3"/>
<circle cx="45" cy="50" r="24" fill="#f3ead8"/><circle cx="53" cy="50" r="20" fill="#0d0906"/>
<path d="M70 38l3 7.6 8.2.4-6.4 5.2 2.2 7.9-7-4.5-7 4.5 2.2-7.9-6.4-5.2 8.2-.4z" fill="#d8ad48"/>
</svg>`;
