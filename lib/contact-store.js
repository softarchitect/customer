import { google } from "googleapis";

const GOOGLE_SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1GDxJxIhuCqkoW8ugybKUYfUJvzC1IYLQcE7cqsLt7yo";
const GOOGLE_SHEETS_GID = process.env.GOOGLE_SHEETS_GID || "86234225";
const GOOGLE_TEMPLATE_SHEET_TITLE = process.env.GOOGLE_TEMPLATE_SHEET_TITLE || "Templates";

let sheetTitleCache = null;

export const ALLOWED_SORT_FIELDS = new Set(["user_id", "full_name", "email", "phone"]);
export const ALLOWED_SORT_DIRECTIONS = new Set(["asc", "desc"]);

function normalize(value) {
  return String(value ?? "").trim();
}

function safeGet(row, idx) {
  if (!Array.isArray(row) || idx < 0 || idx >= row.length) {
    return "";
  }
  return normalize(row[idx]);
}

function fullName(first, last, fallback = "Unknown User") {
  const value = `${normalize(first)} ${normalize(last)}`.trim();
  return value || fallback;
}

function defaultMeta() {
  return {
    sent_whatsapp: false,
    sent_email: false,
    sent_telegram: false,
    sent_other: false,
    received: false,
    note: "",
  };
}

function defaultEmailTemplate() {
  return {
    title: "",
    content: "",
  };
}

function csvEscapeCell(value) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  if (/[",\n\r]/.test(text)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function csvStringFromRows(rows) {
  return rows.map((row) => row.map(csvEscapeCell).join(",")).join("\n");
}

function parseBool(value) {
  const v = normalize(value).toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getGoogleSheetsClient() {
  const clientEmail = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

async function resolveSheetTitle(sheetsClient) {
  if (sheetTitleCache) {
    return sheetTitleCache;
  }

  const spreadsheet = await sheetsClient.spreadsheets.get({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    fields: "sheets(properties(sheetId,title))",
  });

  const sheets = spreadsheet.data.sheets || [];
  const gidAsNumber = Number.parseInt(String(GOOGLE_SHEETS_GID), 10);
  const match = sheets.find((sheet) => sheet.properties?.sheetId === gidAsNumber);
  if (!match?.properties?.title) {
    throw new Error(`Could not find worksheet with gid ${GOOGLE_SHEETS_GID}`);
  }
  sheetTitleCache = match.properties.title;
  return sheetTitleCache;
}

async function ensureTemplateSheetExists(sheetsClient) {
  const spreadsheet = await sheetsClient.spreadsheets.get({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    fields: "sheets(properties(title))",
  });
  const sheets = spreadsheet.data.sheets || [];
  const exists = sheets.some((sheet) => sheet.properties?.title === GOOGLE_TEMPLATE_SHEET_TITLE);
  if (exists) {
    return;
  }

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: GOOGLE_TEMPLATE_SHEET_TITLE } } }],
    },
  });
}

function contactFromRow(row, headerMap) {
  const get = (name) => safeGet(row, headerMap[name] ?? -1);
  const userId = get("user_id");
  if (!userId) {
    return null;
  }

  return {
    user_id: userId,
    full_name: get("full_name") || fullName("", "", `Unknown User #${userId}`),
    email: get("email"),
    phone: get("phone"),
    ...defaultMeta(),
    sent_whatsapp: parseBool(get("sent_whatsapp")),
    sent_email: parseBool(get("sent_email")),
    sent_telegram: parseBool(get("sent_telegram")),
    sent_other: parseBool(get("sent_other")),
    received: parseBool(get("received")),
    note: normalize(get("note")).slice(0, 2000),
  };
}

function contactsToSheetValues(contacts) {
  return [
    [
      "user_id",
      "full_name",
      "email",
      "phone",
      "sent_whatsapp",
      "sent_email",
      "sent_telegram",
      "sent_other",
      "received",
      "note",
    ],
    ...contacts.map((contact) => [
      contact.user_id,
      contact.full_name,
      contact.email,
      contact.phone,
      String(Boolean(contact.sent_whatsapp)),
      String(Boolean(contact.sent_email)),
      String(Boolean(contact.sent_telegram)),
      String(Boolean(contact.sent_other)),
      String(Boolean(contact.received)),
      normalize(contact.note).slice(0, 2000),
    ]),
  ];
}

async function readSheetContactsAndTitle() {
  const sheetsClient = getGoogleSheetsClient();
  const title = await resolveSheetTitle(sheetsClient);
  const readRange = `${title}!A1:Z`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: readRange,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    return { title, contacts: [] };
  }

  const header = rows[0].map((cell) => normalize(cell).toLowerCase());
  const headerMap = {};
  for (let i = 0; i < header.length; i += 1) {
    headerMap[header[i]] = i;
  }

  const contacts = [];
  for (let i = 1; i < rows.length; i += 1) {
    const contact = contactFromRow(rows[i], headerMap);
    if (contact) {
      contacts.push(contact);
    }
  }

  return { title, contacts };
}

async function writeContactsToSheet(title, contacts) {
  const sheetsClient = getGoogleSheetsClient();
  const values = contactsToSheetValues(contacts);

  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${title}!A:Z`,
  });

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${title}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function readContacts() {
  const { contacts } = await readSheetContactsAndTitle();
  return contacts;
}

export async function readEmailTemplate() {
  const sheetsClient = getGoogleSheetsClient();
  await ensureTemplateSheetExists(sheetsClient);
  const range = `${GOOGLE_TEMPLATE_SHEET_TITLE}!A1:B`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    const fallback = defaultEmailTemplate();
    await writeEmailTemplate(fallback);
    return fallback;
  }

  const header = rows[0].map((cell) => normalize(cell).toLowerCase());
  if (header[0] !== "key" || header[1] !== "value") {
    const fallback = defaultEmailTemplate();
    await writeEmailTemplate(fallback);
    return fallback;
  }

  const template = defaultEmailTemplate();
  for (let i = 1; i < rows.length; i += 1) {
    const key = normalize(rows[i][0]).toLowerCase();
    const value = normalize(rows[i][1]);
    if (key === "email_title") {
      template.title = value;
    }
    if (key === "email_content") {
      template.content = value;
    }
  }
  return template;
}

export async function writeEmailTemplate(template) {
  const sheetsClient = getGoogleSheetsClient();
  await ensureTemplateSheetExists(sheetsClient);
  const range = `${GOOGLE_TEMPLATE_SHEET_TITLE}!A1`;

  const values = [
    ["key", "value"],
    ["email_title", normalize(template?.title)],
    ["email_content", normalize(template?.content)],
  ];

  await sheetsClient.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${GOOGLE_TEMPLATE_SHEET_TITLE}!A:B`,
  });

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return {
    title: normalize(template?.title),
    content: normalize(template?.content),
  };
}

function matchesQuery(contact, query) {
  if (!query) {
    return true;
  }
  const q = query.toLowerCase();
  return (
    contact.user_id.toLowerCase().includes(q) ||
    contact.full_name.toLowerCase().includes(q) ||
    contact.email.toLowerCase().includes(q) ||
    contact.phone.toLowerCase().includes(q) ||
    contact.note.toLowerCase().includes(q)
  );
}

export function sortContacts(contacts, sortBy, sortDir) {
  const field = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : "full_name";
  const direction = ALLOWED_SORT_DIRECTIONS.has(sortDir) ? sortDir : "asc";
  const reverse = direction === "desc";

  const sorted = [...contacts].sort((a, b) => {
    const left = normalize(a[field]).toLowerCase();
    const right = normalize(b[field]).toLowerCase();
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  });

  if (reverse) {
    sorted.reverse();
  }
  return sorted;
}

export function paginate(items, page, pageSize) {
  const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1);
  const safePageSize = Math.min(500, Math.max(1, Number.parseInt(String(pageSize), 10) || 25));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const clampedPage = Math.min(safePage, totalPages);
  const start = (clampedPage - 1) * safePageSize;
  const end = start + safePageSize;

  return {
    count: end - start > 0 ? Math.max(0, Math.min(end, total) - start) : 0,
    total_count: total,
    page: clampedPage,
    page_size: safePageSize,
    total_pages: totalPages,
    contacts: items.slice(start, end),
  };
}

export function contactsToCsv(contacts) {
  const rows = [
    [
      "user_id",
      "full_name",
      "email",
      "phone",
      "sent_whatsapp",
      "sent_email",
      "sent_telegram",
      "sent_other",
      "received",
      "note",
    ],
    ...contacts.map((contact) => [
      contact.user_id,
      contact.full_name,
      contact.email,
      contact.phone,
      String(Boolean(contact.sent_whatsapp)),
      String(Boolean(contact.sent_email)),
      String(Boolean(contact.sent_telegram)),
      String(Boolean(contact.sent_other)),
      String(Boolean(contact.received)),
      contact.note,
    ]),
  ];

  return `${csvStringFromRows(rows)}\n`;
}

export async function removeUser(userId) {
  const target = normalize(userId);
  if (!target) {
    return { users_removed: 0, orders_removed: 0 };
  }

  const { title, contacts } = await readSheetContactsAndTitle();
  const kept = contacts.filter((contact) => contact.user_id !== target);
  const removed = contacts.length - kept.length;
  if (removed > 0) {
    await writeContactsToSheet(title, kept);
  }
  return { users_removed: removed, orders_removed: 0 };
}

export async function updateUserMeta(userId, updates) {
  const target = normalize(userId);
  if (!target) {
    return null;
  }

  const { title, contacts } = await readSheetContactsAndTitle();
  const idx = contacts.findIndex((contact) => contact.user_id === target);
  if (idx === -1) {
    return null;
  }

  const current = { ...contacts[idx] };
  if ("sent_whatsapp" in updates) current.sent_whatsapp = Boolean(updates.sent_whatsapp);
  if ("sent_email" in updates) current.sent_email = Boolean(updates.sent_email);
  if ("sent_telegram" in updates) current.sent_telegram = Boolean(updates.sent_telegram);
  if ("sent_other" in updates) current.sent_other = Boolean(updates.sent_other);
  if ("received" in updates) current.received = Boolean(updates.received);
  if ("note" in updates) current.note = normalize(updates.note).slice(0, 2000);

  contacts[idx] = current;
  await writeContactsToSheet(title, contacts);
  return {
    sent_whatsapp: current.sent_whatsapp,
    sent_email: current.sent_email,
    sent_telegram: current.sent_telegram,
    sent_other: current.sent_other,
    received: current.received,
    note: current.note,
  };
}

export async function userExists(userId) {
  const target = normalize(userId);
  if (!target) {
    return false;
  }
  const contacts = await readContacts();
  return contacts.some((contact) => contact.user_id === target);
}

export async function queryContacts({ q = "", sort_by = "full_name", sort_dir = "asc", page = "1", page_size = "25" }) {
  const contacts = await readContacts();
  const filtered = contacts.filter((contact) => matchesQuery(contact, normalize(q).toLowerCase()));
  const sorted = sortContacts(filtered, sort_by, sort_dir);
  return paginate(sorted, page, page_size);
}
