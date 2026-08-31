import { ApiError, api } from './api.ts';
import type { ShortcutView, UsageReport } from './api.ts';
import { clear, dateTime, el, make, relative, showAlert, tally, toast } from './dom.ts';

const SEARCH_DEBOUNCE_MS = 200;
let searchTimer = 0;

function stateCell(shortcut: ShortcutView): HTMLElement {
  if (!shortcut.enabled) return make('span', { className: 'pill flat', text: 'disabled' });
  if (shortcut.retired) return make('span', { className: 'pill bad', text: 'retired' });

  const days = Math.ceil((new Date(shortcut.retiresAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 7) return make('span', { className: 'pill hold', text: `${days}d left` });
  return make('span', { className: 'pill good', text: 'live' });
}

function actionButton(label: string, action: string, code: string): HTMLButtonElement {
  return make('button', {
    className: 'btn tiny quiet',
    text: label,
    attrs: { type: 'button', 'data-action': action, 'aria-label': `${label} /go/${code}` },
  });
}

function row(shortcut: ShortcutView): HTMLTableRowElement {
  const tr = make('tr', { attrs: { 'data-code': shortcut.code } });

  const codeCell = make('td');
  const link = make('a', {
    className: 'code',
    text: `/go/${shortcut.code}`,
    attrs: { href: `/go/${encodeURIComponent(shortcut.code)}`, target: '_blank', rel: 'noreferrer' },
  });
  codeCell.append(link);
  if (shortcut.note) codeCell.append(make('span', { className: 'sub-note', text: shortcut.note }));

  const destinationCell = make('td');
  destinationCell.append(
    make('span', {
      className: 'destination',
      text: shortcut.destination,
      attrs: { title: shortcut.destination },
    }),
  );

  const actions = make('div', { className: 'row-actions' });
  actions.append(
    actionButton('Copy', 'copy', shortcut.code),
    actionButton('Usage', 'usage', shortcut.code),
    actionButton('+30d', 'extend', shortcut.code),
    actionButton(shortcut.enabled ? 'Disable' : 'Enable', 'toggle', shortcut.code),
  );
  const actionCell = make('td', { className: 'right' });
  actionCell.append(actions);

  const stateTd = make('td');
  stateTd.append(stateCell(shortcut));

  tr.append(
    codeCell,
    destinationCell,
    make('td', { text: shortcut.owner }),
    make('td', { className: 'right mono', text: String(shortcut.useCount) }),
    stateTd,
    actionCell,
  );
  return tr;
}

export async function loadDirectory(): Promise<void> {
  const search = el<HTMLInputElement>('search').value.trim();
  try {
    const { tally: totals, shortcuts } = await api.directory(search);

    const tallies = el('tallies');
    clear(tallies);
    tallies.append(
      tally('Shortcuts', totals.total),
      tally('Live', totals.live),
      tally('Disabled', totals.disabled),
      tally('Retired', totals.retired),
      tally('Total uses', totals.uses),
    );

    const body = el('directory-body');
    clear(body);
    shortcuts.forEach((shortcut) => body.append(row(shortcut)));

    el('directory-empty').hidden = shortcuts.length > 0;
    el('directory-count').textContent = search
      ? `${shortcuts.length} of ${totals.total} shortcuts match “${search}”.`
      : `${totals.total} shortcuts registered.`;
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not load the directory', 'bad');
  }
}

async function showUsage(code: string): Promise<void> {
  const report: UsageReport = await api.usage(code);
  el('usage-code').textContent = `/go/${report.code}`;

  const figures = make('ul', { className: 'usage-grid' });
  figures.append(
    tally('Total uses', report.totalUses),
    tally('Last 24 hours', report.usesLastDay),
    tally('Distinct visitors', report.distinctVisitors),
    tally('Retires', relative(report.retiresAt)),
  );

  const sources = make('ul', { className: 'usage-list' });
  if (report.topSources.length === 0) {
    sources.append(make('li', { text: 'No referrer data yet' }));
  } else {
    report.topSources.forEach((source) =>
      sources.append(make('li', { text: `${source.host} — ${source.uses}` })),
    );
  }

  const recent = make('ul', { className: 'usage-list' });
  if (report.recentUses.length === 0) {
    recent.append(make('li', { text: 'No uses recorded yet' }));
  } else {
    report.recentUses.forEach((use) =>
      recent.append(
        make('li', { text: `${dateTime(use.happenedAt)} — ${use.sourceHost ?? 'direct'}` }),
      ),
    );
  }

  const body = el('usage-body');
  clear(body);
  body.append(
    figures,
    make('h3', { className: 'section-title', text: 'Top referrers' }),
    sources,
    make('h3', { className: 'section-title', text: 'Recent uses' }),
    recent,
  );

  const card = el('usage-card');
  card.hidden = false;
  el('usage-close').focus();
}

async function handleAction(event: Event): Promise<void> {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!button) return;
  const code = button.closest<HTMLTableRowElement>('tr[data-code]')?.dataset['code'];
  if (!code) return;

  try {
    switch (button.dataset['action']) {
      case 'copy':
        await navigator.clipboard.writeText(`${window.location.origin}/go/${code}`);
        toast(`Copied /go/${code} to the clipboard`);
        break;
      case 'usage':
        await showUsage(code);
        break;
      case 'extend':
        await api.amend(code, { extendByDays: 30 });
        toast(`Extended /go/${code} by 30 days`);
        await loadDirectory();
        break;
      case 'toggle': {
        const turningOn = button.textContent?.trim() === 'Enable';
        await api.amend(code, { enabled: turningOn });
        toast(`${turningOn ? 'Enabled' : 'Disabled'} /go/${code}`);
        await loadDirectory();
        break;
      }
      default:
        break;
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : 'That action failed', 'bad');
  }
}

async function handleCreate(event: Event): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const alert = el('create-alert');
  const urlField = el<HTMLInputElement>('url');
  const aliasField = el<HTMLInputElement>('alias');
  const lifetime = el<HTMLInputElement>('lifetimeDays').value.trim();

  try {
    const created = await api.register({
      url: urlField.value.trim(),
      alias: aliasField.value.trim() || null,
      owner: el<HTMLInputElement>('owner').value.trim() || null,
      note: el<HTMLInputElement>('note').value.trim() || null,
      lifetimeDays: lifetime === '' ? null : Number(lifetime),
    });

    showAlert(alert, null);
    urlField.removeAttribute('aria-invalid');
    aliasField.removeAttribute('aria-invalid');
    form.reset();
    urlField.focus();
    toast(`Registered /go/${created.code}`);
    await loadDirectory();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not register the shortcut';
    showAlert(alert, message);

    // Mark and focus the field the API blamed, so keyboard users land on it.
    const fields = error instanceof ApiError ? error.fields : {};
    const target = 'url' in fields ? urlField : 'alias' in fields ? aliasField : null;
    if (target) {
      target.setAttribute('aria-invalid', 'true');
      target.focus();
    }
  }
}

export function initShortcutsPanel(): void {
  el('create-form').addEventListener('submit', (event) => void handleCreate(event));
  el('directory-body').addEventListener('click', (event) => void handleAction(event));
  el('usage-close').addEventListener('click', () => {
    el('usage-card').hidden = true;
  });
  el('search').addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void loadDirectory(), SEARCH_DEBOUNCE_MS);
  });
}
