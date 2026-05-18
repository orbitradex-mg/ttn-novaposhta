/**
 * @param {Date} date
 * @returns {string} DD.MM.YYYY (формат API Нової пошти)
 */
export function formatApiDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {string} DD.MM.YYYY
 */
export function isoToApiDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * @param {string} value
 * @returns {string}
 */
export function formatDisplayDate(value) {
  if (!value) return '—';
  const parsed = new Date(value.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1'));
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * @param {string} status
 */
export function statusClass(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('отрим') || s.includes('видан') || s.includes('доставлен')) {
    return 'status--delivered';
  }
  if (s.includes('поверн') || s.includes('відмов') || s.includes('утиліз')) {
    return 'status--issue';
  }
  if (s.includes('дороз') || s.includes('прибув') || s.includes('відправ')) {
    return 'status--transit';
  }
  return 'status--default';
}

/**
 * @param {Record<string, unknown>} doc
 */
export function normalizeDocument(doc, tracking) {
  const ttn = doc.IntDocNumber || doc.Number || '';
  const track = tracking?.get(ttn);
  const status =
    track?.Status ||
    doc.StateName ||
    doc.Status ||
    doc.DocumentStatus ||
    '—';

  return {
    ttn,
    date: doc.DateTime || doc.CreateTime || doc.DateCreated || '',
    recipient:
      doc.RecipientContactPerson ||
      doc.RecipientName ||
      doc.CounterpartyRecipientDescription ||
      '—',
    phone: doc.RecipientsPhone || doc.PhoneRecipient || doc.RecipientPhone || '—',
    city: doc.CityRecipient || doc.RecipientCityName || '—',
    warehouse: doc.RecipientAddressName || doc.WarehouseRecipient || '',
    status,
    description:
      doc.Description ||
      doc.AdditionalInformation ||
      doc.InfoRegClientBarcodes ||
      '—',
    cod: doc.AfterpaymentOnGoodsCost || doc.Cost || doc.DocumentCost || '',
    payer: doc.PayerType || '',
    raw: doc,
  };
}

/**
 * @param {ReturnType<typeof normalizeDocument>} row
 * @param {string} query
 */
export function matchesSearch(row, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    row.ttn,
    row.recipient,
    row.phone,
    row.city,
    row.warehouse,
    row.status,
    row.description,
    String(row.cod),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * @param {ReturnType<typeof normalizeDocument>[]} rows
 */
export function computeStats(rows) {
  let transit = 0;
  let delivered = 0;

  for (const row of rows) {
    const cls = statusClass(row.status);
    if (cls === 'status--delivered') delivered += 1;
    else if (cls === 'status--transit') transit += 1;
  }

  return { total: rows.length, transit, delivered };
}

export function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 13);
  return { from, to };
}
