import { API_URL, PAGE_SIZE } from './config.js?v=20260520';

/**
 * @param {string} apiKey
 * @param {string} modelName
 * @param {string} calledMethod
 * @param {Record<string, unknown>} [methodProperties]
 */
export async function novaPoshtaRequest(apiKey, modelName, calledMethod, methodProperties = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      apiKey,
      modelName,
      calledMethod,
      methodProperties,
    }),
  });

  if (!response.ok) {
    throw new Error(`Помилка мережі: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.success) {
    const errors = Array.isArray(data.errors) ? data.errors.join('; ') : 'Невідома помилка API';
    throw new Error(errors);
  }

  return data;
}

/**
 * @param {string} apiKey
 * @param {string} dateFrom DD.MM.YYYY
 * @param {string} dateTo DD.MM.YYYY
 */
export async function fetchAllDocuments(apiKey, dateFrom, dateTo) {
  const documents = [];
  let page = 1;

  while (true) {
    const data = await novaPoshtaRequest(apiKey, 'InternetDocument', 'getDocumentList', {
      DateTimeFrom: dateFrom,
      DateTimeTo: dateTo,
      Page: String(page),
      Limit: String(PAGE_SIZE),
      GetFullList: '0',
    });

    const batch = data.data || [];
    documents.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    page += 1;
    if (page > 50) {
      break;
    }
  }

  return documents;
}

/**
 * @param {string} apiKey
 * @param {string[]} documentNumbers
 */
export async function fetchTrackingStatuses(apiKey, documentNumbers) {
  const unique = [...new Set(documentNumbers.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }

  const statusMap = new Map();
  const chunkSize = 100;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const documents = chunk.map((DocumentNumber) => ({ DocumentNumber }));

    const data = await novaPoshtaRequest(apiKey, 'TrackingDocument', 'getStatusDocuments', {
      Documents: documents,
    });

    for (const item of data.data || []) {
      statusMap.set(item.Number || item.DocumentNumber, item);
    }
  }

  return statusMap;
}
