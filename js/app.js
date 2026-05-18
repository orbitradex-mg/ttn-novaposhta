import { fetchAllDocuments, fetchTrackingStatuses } from './api.js?v=20260518c';
import { STATIC_DATA_PATH, STORAGE_KEYS, TRACK_URL } from './config.js?v=20260518c';
import {
  computeStats,
  defaultDateRange,
  enrichRow,
  formatApiDate,
  formatDisplayDate,
  isoToApiDate,
  matchesSearch,
  normalizeDocument,
  statusClass,
} from './utils.js?v=20260518c';

const $ = (id) => document.getElementById(id);

let allRows = [];
let isLoading = false;

function getApiKey() {
  return localStorage.getItem(STORAGE_KEYS.apiKey)?.trim() || '';
}

function getLoadMode() {
  return localStorage.getItem(STORAGE_KEYS.loadMode) || 'auto';
}

function saveSettings({ apiKey, loadMode }) {
  if (apiKey !== undefined) {
    if (apiKey) {
      localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
    } else {
      localStorage.removeItem(STORAGE_KEYS.apiKey);
    }
  }
  if (loadMode) {
    localStorage.setItem(STORAGE_KEYS.loadMode, loadMode);
  }
}

function showToast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('toast--visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.remove('toast--visible'), 2800);
}

function setUiState(state, message = '') {
  $('loading').hidden = state !== 'loading';
  $('error').hidden = state !== 'error';
  $('empty').hidden = state !== 'empty';
  $('table-container').hidden = state !== 'table';
  $('stats').hidden = state !== 'table';

  if (state === 'error') {
    $('error').innerHTML = `<p><strong>Помилка</strong></p><p>${escapeHtml(message)}</p>`;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function initDates() {
  const savedFrom = localStorage.getItem(STORAGE_KEYS.dateFrom);
  const savedTo = localStorage.getItem(STORAGE_KEYS.dateTo);
  const { from, to } = defaultDateRange();

  $('date-from').value = savedFrom || formatInputDate(from);
  $('date-to').value = savedTo || formatInputDate(to);
}

function formatInputDate(date) {
  return date.toISOString().slice(0, 10);
}

function persistDates() {
  localStorage.setItem(STORAGE_KEYS.dateFrom, $('date-from').value);
  localStorage.setItem(STORAGE_KEYS.dateTo, $('date-to').value);
}

async function loadStaticData() {
  const url = new URL(STATIC_DATA_PATH, window.location.href).href;
  const response = await fetch(`${url}?t=${Date.now()}`);

  if (!response.ok) {
    throw new Error(
      'Файл data/shipments.json не знайдено. Запустіть синхронізацію в GitHub Actions або введіть API-ключ.'
    );
  }

  const payload = await response.json();
  return {
    documents: payload.documents || [],
    syncedAt: payload.syncedAt || null,
    source: 'static',
  };
}

async function loadFromApi() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Вкажіть API-ключ Нової пошти в налаштуваннях.');
  }

  const dateFrom = isoToApiDate($('date-from').value);
  const dateTo = isoToApiDate($('date-to').value);

  if (!dateFrom || !dateTo) {
    throw new Error('Оберіть період дат.');
  }

  const documents = await fetchAllDocuments(apiKey, dateFrom, dateTo);
  const numbers = documents.map((d) => d.IntDocNumber).filter(Boolean);
  let tracking = new Map();

  try {
    tracking = await fetchTrackingStatuses(apiKey, numbers);
  } catch {
    /* статуси з getDocumentList достатні як запасний варіант */
  }

  return {
    documents: documents.map((doc) => {
      const row = normalizeDocument(doc, tracking);
      return { ...row, raw: doc };
    }),
    syncedAt: new Date().toISOString(),
    source: 'api',
  };
}

async function loadData() {
  if (isLoading) return;
  isLoading = true;
  persistDates();
  setUiState('loading');

  const mode = getLoadMode();
  const hasKey = Boolean(getApiKey());

  try {
    let result;

    if (mode === 'static') {
      result = await loadStaticData();
      allRows = (result.documents || []).map((doc) =>
        enrichRow(typeof doc.ttn !== 'undefined' ? doc : normalizeDocument(doc, new Map()))
      );
      setMeta('static', result.syncedAt);
    } else if (mode === 'api' || (mode === 'auto' && hasKey)) {
      result = await loadFromApi();
      allRows = result.documents.map(enrichRow);
      setMeta('api', result.syncedAt);
    } else {
      result = await loadStaticData();
      allRows = (result.documents || []).map((doc) =>
        enrichRow(typeof doc.ttn !== 'undefined' ? doc : normalizeDocument(doc, new Map()))
      );
      setMeta('static', result.syncedAt);
    }

    renderTable();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (mode === 'auto' && hasKey) {
      try {
        const fallback = await loadStaticData();
        allRows = (fallback.documents || []).map((doc) =>
          enrichRow(typeof doc.ttn !== 'undefined' ? doc : normalizeDocument(doc, new Map()))
        );
        setMeta('static', fallback.syncedAt);
        renderTable();
        showToast('API недоступний — показано збережені дані');
        return;
      } catch {
        /* ignore */
      }
    }
    setUiState('error', msg);
  } finally {
    isLoading = false;
  }
}

function setMeta(source, syncedAt) {
  const badge = $('data-source');
  if (source === 'api') {
    badge.textContent = 'Джерело: API Нової пошти';
    badge.className = 'badge badge--api';
  } else {
    badge.textContent = 'Джерело: файл на GitHub';
    badge.className = 'badge badge--static';
  }

  $('last-updated').textContent = syncedAt
    ? `Оновлено: ${formatDisplayDate(syncedAt)}`
    : '';
}

function rowInDateRange(row) {
  const from = $('date-from').value;
  const to = $('date-to').value;
  if (!from || !to || !row.date) return true;

  const parsed = new Date(String(row.date).replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1'));
  if (Number.isNaN(parsed.getTime())) return true;

  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  return parsed >= start && parsed <= end;
}

function renderTable() {
  const query = $('search').value.trim();
  const filtered = allRows
    .filter((row) => rowInDateRange(row))
    .filter((row) => matchesSearch(row, query))
    .sort((a, b) => {
    return String(b.date).localeCompare(String(a.date));
  });

  if (filtered.length === 0) {
    setUiState('empty');
    return;
  }

  const stats = computeStats(filtered);
  $('stat-total').textContent = String(stats.total);
  $('stat-transit').textContent = String(stats.transit);
  $('stat-delivered').textContent = String(stats.delivered);

  const tbody = $('table-body');
  tbody.innerHTML = filtered
    .map((row) => {
      const location = [row.city, row.warehouse].filter(Boolean).join(', ');
      const cod =
        row.cod && Number(row.cod) > 0
          ? `${Number(row.cod).toLocaleString('uk-UA')} ₴`
          : '—';

      return `<tr>
        <td>
          <a class="ttn-link" href="${TRACK_URL}${encodeURIComponent(row.ttn)}" target="_blank" rel="noopener">
            ${escapeHtml(row.ttn)}
          </a>
        </td>
        <td class="internal-number">${escapeHtml(row.internalNumber || '—')}</td>
        <td>${escapeHtml(formatDisplayDate(row.date))}</td>
        <td>${escapeHtml(row.recipient)}</td>
        <td>${escapeHtml(row.phone)}</td>
        <td>${escapeHtml(location || '—')}</td>
        <td><span class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
        <td>${escapeHtml(row.description)}</td>
        <td>${escapeHtml(cod)}</td>
        <td>
          <button type="button" class="btn btn--ghost btn--sm" data-copy="${escapeHtml(row.ttn)}" title="Копіювати ТТН">Копія</button>
        </td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ttn = btn.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(ttn);
        showToast(`Скопійовано: ${ttn}`);
      } catch {
        showToast('Не вдалося скопіювати');
      }
    });
  });

  setUiState('table');
}

function openSettings() {
  $('api-key').value = getApiKey();
  $('load-mode').value = getLoadMode();
  $('settings-modal').showModal();
}

function bindEvents() {
  $('btn-refresh').addEventListener('click', () => loadData());
  $('btn-settings').addEventListener('click', openSettings);
  $('settings-close').addEventListener('click', () => $('settings-modal').close());

  $('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings({
      apiKey: $('api-key').value.trim(),
      loadMode: $('load-mode').value,
    });
    $('settings-modal').close();
    showToast('Налаштування збережено');
    loadData();
  });

  $('btn-clear-key').addEventListener('click', () => {
    $('api-key').value = '';
    saveSettings({ apiKey: '' });
    showToast('API-ключ видалено');
  });

  let searchTimer;
  $('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderTable, 200);
  });

  $('date-from').addEventListener('change', () => loadData());
  $('date-to').addEventListener('change', () => loadData());
}

initDates();
bindEvents();
loadData();
