import { api } from './api.ts';
import { el } from './dom.ts';
import { initShortcutsPanel, loadDirectory } from './shortcuts-panel.ts';

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

initShortcutsPanel();
void loadDirectory();
void pollHealth();
window.setInterval(() => void pollHealth(), 30_000);
