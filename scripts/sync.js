/**
 * Синхронізація відправлень Нової пошти → data/shipments.json
 * Запуск: NP_API_KEY=xxx node scripts/sync.js
 * Опційно: NP_DAYS=14 — скільки днів назад завантажувати
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const API_URL = 'https://api.novaposhta.ua/v2.0/json/';
const PAGE_SIZE = 100;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_FILE = join(ROOT, 'data', 'shipments.json');

const apiKey = process.env.NP_API_KEY?.trim();
const days = Math.max(1, parseInt(process.env.NP_DAYS || '14', 10));

if (!apiKey) {
  console.error('Встановіть змінну NP_API_KEY');
  process.exit(1);
}

function formatApiDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

async function novaPoshtaRequest(modelName, calledMethod, methodProperties = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error((data.errors || ['API error']).join('; '));
  }
  return data;
}

async function fetchAllDocuments(dateFrom, dateTo) {
  const documents = [];
  let page = 1;

  while (true) {
    const data = await novaPoshtaRequest('InternetDocument', 'getDocumentList', {
      DateTimeFrom: dateFrom,
      DateTimeTo: dateTo,
      Page: String(page),
      Limit: String(PAGE_SIZE),
    });

    const batch = data.data || [];
    documents.push(...batch);

    if (batch.length < PAGE_SIZE || page >= 50) break;
    page += 1;
  }

  return documents;
}

async function fetchTrackingStatuses(numbers) {
  const map = new Map();
  const unique = [...new Set(numbers.filter(Boolean))];

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const data = await novaPoshtaRequest('TrackingDocument', 'getStatusDocuments', {
      Documents: chunk.map((DocumentNumber) => ({ DocumentNumber })),
    });

    for (const item of data.data || []) {
      map.set(item.Number || item.DocumentNumber, item);
    }
  }

  return map;
}

function normalize(doc, tracking) {
  const ttn = doc.IntDocNumber || doc.Number || '';
  const track = tracking.get(ttn);

  const internalNumber = (
    doc.InfoRegClientBarcodes ||
    doc.ClientBarcode ||
    doc.OrderNumber ||
    ''
  ).trim();

  const city =
    doc.CityRecipientDescription ||
    doc.RecipientCityName ||
    doc.SettlmentAddressData?.RecipientSettlementDescription ||
    '—';

  const warehouse =
    doc.RecipientAddressDescription ||
    doc.RecipientAddressName ||
    (doc.SettlmentAddressData?.RecipientWarehouseNumber
      ? `Відділення №${doc.SettlmentAddressData.RecipientWarehouseNumber}`
      : '');

  const location = [city, warehouse]
    .filter((part) => part && part !== '—')
    .join(', ');

  return {
    ttn,
    internalNumber: internalNumber || '—',
    date: doc.DateTime || doc.CreateTime || '',
    recipient:
      doc.RecipientContactPerson ||
      doc.RecipientName ||
      doc.CounterpartyRecipientDescription ||
      '—',
    phone: doc.RecipientsPhone || doc.PhoneRecipient || '—',
    city,
    warehouse,
    location: location || '—',
    status: track?.Status || doc.StateName || doc.Status || '—',
    description: doc.Description || doc.AdditionalInformation || '—',
    cod: doc.AfterpaymentOnGoodsCost || doc.Cost || '',
  };
}

async function main() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const dateFrom = formatApiDate(from);
  const dateTo = formatApiDate(to);

  console.log(`Завантаження ЕН з ${dateFrom} по ${dateTo}…`);

  const raw = await fetchAllDocuments(dateFrom, dateTo);
  const numbers = raw.map((d) => d.IntDocNumber).filter(Boolean);

  let tracking = new Map();
  try {
    tracking = await fetchTrackingStatuses(numbers);
  } catch (err) {
    console.warn('Статуси трекінгу недоступні:', err.message);
  }

  const documents = raw.map((doc) => normalize(doc, tracking)).filter((d) => d.ttn);

  const payload = {
    syncedAt: new Date().toISOString(),
    dateFrom,
    dateTo,
    count: documents.length,
    documents,
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`Збережено ${documents.length} відправлень → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
