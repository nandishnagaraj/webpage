const CONFIG = {
  SPREADSHEET_ID: '1NE45yyxQiXUCfeX93eQIESEya6AZOo5DSwZ0TPjY4qU',
  SHEET_NAME: 'Gossip',
  MAX_BLAST_LENGTH: 500,
};

const HEADERS = [
  'Timestamp',
  'Blast ID',
  'Category',
  'Gossip Details',
  'Status',
  'Moderation Note',
  'Published At',
  'Reports',
];

const HEADER_ALIASES = {
  timestamp: ['timestamp'],
  id: ['blast id', 'id'],
  category: ['category'],
  text: ['gossip details', 'blast'],
  status: ['status'],
  publishedAt: ['published at'],
};

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = spreadsheet.getSheets()[0];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = (e.parameter.action || '').toLowerCase();
    if (action === 'published') return getPublished_();
    if (action === 'debug') return getDebug_();
    return json_({ ok: true, service: 'anonymous-blast', message: 'API is running' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function getPublished_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return json_({ ok: true, blasts: [] });

  const publicStatuses = ['APPROVED', 'PUBLISHED'];
  const column = getColumns_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const blasts = values
    .filter(row => publicStatuses.includes(cell_(row, column.status).toUpperCase()))
    .map(row => ({
      id: cell_(row, column.id),
      category: cell_(row, column.category) || 'CAMPUS',
      text: cell_(row, column.text),
      publishedAt: formatDate_(row[column.publishedAt] || row[column.timestamp]),
    }))
    .reverse();

  return json_({ ok: true, blasts });
}

function getDebug_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String) : [];
  const statusIndex = findHeaderIndex_(headers, HEADER_ALIASES.status);
  const statuses = {};

  if (lastRow > 1 && statusIndex > -1) {
    sheet.getRange(2, statusIndex + 1, lastRow - 1, 1).getValues().forEach(row => {
      const status = String(row[0] || '').trim() || '(blank)';
      statuses[status] = (statuses[status] || 0) + 1;
    });
  }

  return json_({
    ok: true,
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    configuredSheetName: CONFIG.SHEET_NAME,
    availableSheetNames: SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheets().map(sheet => sheet.getName()),
    sheetName: sheet.getName(),
    lastRow,
    lastColumn,
    headers,
    statuses,
  });
}

function doPost(e) {
  try {
    const category = clean_(e.parameter.category || 'CAMPUS').toUpperCase();
    const blast = clean_(e.parameter.blast || '');

    if (blast.length < 10) return json_({ ok: false, error: 'Blast is too short.' });
    if (blast.length > CONFIG.MAX_BLAST_LENGTH) return json_({ ok: false, error: 'Blast is too long.' });

    const allowedCategories = ['CAMPUS', 'EVENTS', 'FUNNY', 'OTHER'];
    const safeCategory = allowedCategories.includes(category) ? category : 'OTHER';
    const id = Utilities.getUuid();

    const sheet = getSheet_();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet.appendRow([
        new Date(),
        id,
        safeCategory,
        blast,
        'PENDING',
        '',
        '',
      ]);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true, id, status: 'PENDING' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function clean_(value) {
  return String(value)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getColumns_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  return {
    timestamp: requireHeader_(headers, HEADER_ALIASES.timestamp),
    id: requireHeader_(headers, HEADER_ALIASES.id),
    category: requireHeader_(headers, HEADER_ALIASES.category),
    text: requireHeader_(headers, HEADER_ALIASES.text),
    status: requireHeader_(headers, HEADER_ALIASES.status),
    publishedAt: requireHeader_(headers, HEADER_ALIASES.publishedAt),
  };
}

function requireHeader_(headers, names) {
  const index = findHeaderIndex_(headers, names);
  if (index === -1) throw new Error(`Missing required header: ${names.join(' or ')}`);
  return index;
}

function findHeaderIndex_(headers, names) {
  const normalizedNames = names.map(normalizeHeader_);
  return headers.findIndex(header => normalizedNames.includes(normalizeHeader_(header)));
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase();
}

function cell_(row, index) {
  return String(row[index] || '').trim();
}

function formatDate_(value) {
  return value instanceof Date ? value.toISOString() : String(value || '');
}
