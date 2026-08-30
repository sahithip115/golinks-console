import { api } from './api.ts';
import { el } from './dom.ts';
import { initDeliveryPanel } from './delivery-panel.ts';
import { initShortcutsPanel, loadDirectory } from './shortcuts-panel.ts';

/** Tabs follow the ARIA pattern: arrow keys move between them, and only the active tab is tabbable. */
function initTabs(): void {
  const tablist = el('tabs');
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>('.tab')];

  const select = (tab: HTMLButtonElement): void => {
    for (const candidate of tabs) {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', String(active));
      candidate.tabIndex = active ? 0 : -1;
      el(`panel-${candidate.dataset['panel'] ?? ''}`).hidden = !active;
    }
    tab.focus();
  };

  tablist.addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab');
    if (tab) select(tab);
  });

  tablist.addEventListener('keydown', (event) => {
    const index = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next) select(next);
  });
}

async function pollHealth(): Promise<void> {
  const banner = el('health');
  const text = el('health-text');
  try {
    const health = await api.health();
    banner.className = 'health up';
    text.textContent = `Service ${health.status} · up ${health.uptimeSeconds}s`;
  } catch {
    banner.className = 'health down';
    text.textContent = 'Service unreachable';
  }
}

initTabs();
initShortcutsPanel();
void loadDirectory();
void initDeliveryPanel();
void pollHealth();
window.setInterval(() => void pollHealth(), 30_000);
