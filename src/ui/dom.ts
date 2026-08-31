/** Small DOM helpers. Text is always set as text, never interpolated as markup. */

export function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

export function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string; attrs?: Record<string, string> } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function words(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ');
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function relative(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function showAlert(node: HTMLElement, message: string | null): void {
  node.hidden = message === null;
  node.textContent = message ?? '';
}

let toastTimer = 0;

/** Announced politely rather than stealing focus, so a screen reader is not interrupted. */
export function toast(message: string, kind: 'ok' | 'bad' = 'ok'): void {
  const node = el('toast');
  node.textContent = message;
  node.className = kind === 'bad' ? 'toast bad' : 'toast';
  node.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.hidden = true;
  }, 4000);
}

export function tally(label: string, value: string | number): HTMLLIElement {
  const item = make('li', { className: 'tally' });
  item.append(
    make('p', { className: 'tally-label', text: label }),
    make('p', { className: 'tally-value', text: String(value) }),
  );
  return item;
}
