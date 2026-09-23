export interface CsvRecord {
  fields: string[];
  raw: string;
}

export interface ParsedCsv {
  headers: string[];
  records: CsvRecord[];
}

export function parseCsv(text: string): ParsedCsv {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let raw = '';
  let inQuotes = false;

  const pushField = () => {
    fields.push(field);
    field = '';
  };

  const pushRecord = () => {
    pushField();
    if (!(fields.length === 1 && fields[0] === '' && raw === '')) {
      records.push({ fields, raw });
    }
    fields = [];
    raw = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      raw += ch;
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          raw += text[i + 1];
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      raw += ch;
    } else if (ch === ',') {
      raw += ch;
      pushField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRecord();
    } else {
      field += ch;
      raw += ch;
    }
  }

  if (inQuotes) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length > 0 || fields.length > 0 || raw.length > 0) pushRecord();
  if (records.length === 0) throw new Error('CSV contains no rows.');

  const [header, ...data] = records;
  const headers = header.fields.map((value, index) => {
    const trimmed = index === 0 ? value.replace(/^\uFEFF/, '').trim() : value.trim();
    if (!trimmed) throw new Error(`CSV header ${index + 1} is empty.`);
    return trimmed;
  });

  for (const [index, record] of data.entries()) {
    if (record.fields.length !== headers.length) {
      throw new Error(`CSV row ${index + 2} has ${record.fields.length} fields; expected ${headers.length}.`);
    }
  }

  return { headers, records: data };
}

export function recordToObject(headers: string[], record: CsvRecord): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, record.fields[index] ?? '']));
}
