PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migration (
  version INTEGER PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum_sha256 TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pension_case (
  case_id INTEGER PRIMARY KEY,
  case_name TEXT NOT NULL UNIQUE,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plan (
  plan_id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES pension_case(case_id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  plan_number TEXT,
  sponsor_ein TEXT,
  sponsor_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(case_id, plan_number)
);

CREATE TABLE plan_year (
  plan_year_id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES plan(plan_id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK(year BETWEEN 1900 AND 2200),
  period_begin TEXT,
  period_end TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id, year)
);

CREATE TABLE source_document (
  source_document_id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  file_size INTEGER NOT NULL CHECK(file_size >= 0),
  source_type TEXT NOT NULL CHECK(source_type IN ('EFAST_CSV','FORM_5500_PDF','DATABASE_BACKUP','OTHER')),
  original_source_url TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE filing (
  filing_id INTEGER PRIMARY KEY,
  plan_year_id INTEGER NOT NULL REFERENCES plan_year(plan_year_id) ON DELETE CASCADE,
  filing_type TEXT NOT NULL DEFAULT 'FORM_5500',
  filing_date TEXT,
  efast_filing_id TEXT,
  source_url TEXT,
  source_document_id INTEGER REFERENCES source_document(source_document_id) ON DELETE SET NULL,
  amended_flag INTEGER NOT NULL DEFAULT 0 CHECK(amended_flag IN (0,1)),
  filing_status TEXT NOT NULL DEFAULT 'EXPECTED' CHECK(filing_status IN ('EXPECTED','MATCHED','PARSED','VERIFIED')),
  import_timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_filing_efast_id
  ON filing(efast_filing_id)
  WHERE efast_filing_id IS NOT NULL;
CREATE INDEX idx_filing_plan_year ON filing(plan_year_id);

CREATE TABLE form_definition (
  form_definition_id INTEGER PRIMARY KEY,
  form_name TEXT NOT NULL,
  schedule_name TEXT,
  form_year INTEGER NOT NULL CHECK(form_year BETWEEN 1900 AND 2200),
  version TEXT NOT NULL DEFAULT '1',
  UNIQUE(form_name, schedule_name, form_year, version)
);

CREATE TABLE line_definition (
  line_definition_id INTEGER PRIMARY KEY,
  form_definition_id INTEGER NOT NULL REFERENCES form_definition(form_definition_id) ON DELETE CASCADE,
  schedule_name TEXT,
  part TEXT,
  location_reference TEXT NOT NULL,
  subfield TEXT NOT NULL DEFAULT '',
  canonical_concept TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK(value_type IN ('TEXT','NUMBER','INTEGER','DATE','BOOLEAN')),
  unit TEXT,
  UNIQUE(form_definition_id, part, location_reference, subfield)
);

CREATE INDEX idx_line_exact
  ON line_definition(schedule_name, part, location_reference, subfield);
CREATE INDEX idx_line_canonical ON line_definition(canonical_concept);

CREATE TABLE filing_value (
  filing_value_id INTEGER PRIMARY KEY,
  filing_id INTEGER NOT NULL REFERENCES filing(filing_id) ON DELETE CASCADE,
  line_definition_id INTEGER NOT NULL REFERENCES line_definition(line_definition_id) ON DELETE RESTRICT,
  raw_value TEXT,
  normalized_text TEXT,
  normalized_number REAL,
  normalized_date TEXT,
  extraction_method TEXT NOT NULL,
  extraction_confidence REAL CHECK(extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('SOURCE_REPORTED','EXTRACTED_UNVERIFIED','USER_VERIFIED','USER_CORRECTED','DERIVED')),
  source_page INTEGER CHECK(source_page IS NULL OR source_page > 0),
  source_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(filing_id, line_definition_id)
);

CREATE INDEX idx_filing_value_filing ON filing_value(filing_id);
CREATE INDEX idx_filing_value_line ON filing_value(line_definition_id);

CREATE TABLE filing_value_revision (
  revision_id INTEGER PRIMARY KEY,
  filing_value_id INTEGER NOT NULL REFERENCES filing_value(filing_value_id) ON DELETE CASCADE,
  revision_reason TEXT NOT NULL,
  raw_value TEXT,
  normalized_text TEXT,
  normalized_number REAL,
  normalized_date TEXT,
  extraction_method TEXT NOT NULL,
  extraction_confidence REAL,
  verification_status TEXT NOT NULL,
  source_page INTEGER,
  source_text TEXT,
  replaced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE efast_import (
  efast_import_id INTEGER PRIMARY KEY,
  source_document_id INTEGER NOT NULL REFERENCES source_document(source_document_id) ON DELETE RESTRICT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL CHECK(row_count >= 0),
  UNIQUE(source_document_id)
);

CREATE TABLE efast_import_row (
  import_row_id INTEGER PRIMARY KEY,
  efast_import_id INTEGER NOT NULL REFERENCES efast_import(efast_import_id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK(row_number > 0),
  plan_number TEXT,
  plan_name TEXT,
  plan_year INTEGER,
  date_received TEXT,
  plan_codes TEXT,
  participants INTEGER,
  participants_eoy INTEGER,
  assets_boy REAL,
  assets_eoy REAL,
  source_url TEXT,
  raw_row_json TEXT NOT NULL,
  raw_record_text TEXT NOT NULL,
  matched_filing_id INTEGER REFERENCES filing(filing_id) ON DELETE SET NULL,
  UNIQUE(efast_import_id, row_number)
);

CREATE INDEX idx_efast_row_plan_year ON efast_import_row(plan_number, plan_year);
CREATE INDEX idx_efast_row_matched ON efast_import_row(matched_filing_id);

CREATE TABLE document_match (
  document_match_id INTEGER PRIMARY KEY,
  import_row_id INTEGER REFERENCES efast_import_row(import_row_id) ON DELETE CASCADE,
  source_document_id INTEGER NOT NULL REFERENCES source_document(source_document_id) ON DELETE CASCADE,
  match_method TEXT NOT NULL,
  match_score REAL NOT NULL CHECK(match_score >= 0 AND match_score <= 1),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('AUTO_ACCEPTED','AMBIGUOUS','UNMATCHED','USER_ACCEPTED','USER_REJECTED')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(import_row_id, source_document_id)
);

CREATE INDEX idx_document_match_status ON document_match(verification_status, match_score DESC);

CREATE TABLE document_chunk (
  chunk_id INTEGER PRIMARY KEY,
  source_document_id INTEGER NOT NULL REFERENCES source_document(source_document_id) ON DELETE CASCADE,
  page_number INTEGER CHECK(page_number IS NULL OR page_number > 0),
  section TEXT,
  text TEXT NOT NULL,
  chunk_order INTEGER NOT NULL CHECK(chunk_order >= 0),
  UNIQUE(source_document_id, chunk_order)
);

CREATE VIRTUAL TABLE document_chunk_fts USING fts5(
  text,
  section,
  chunk_id UNINDEXED,
  source_document_id UNINDEXED,
  page_number UNINDEXED,
  tokenize = 'unicode61'
);

CREATE TRIGGER document_chunk_ai AFTER INSERT ON document_chunk BEGIN
  INSERT INTO document_chunk_fts(text, section, chunk_id, source_document_id, page_number)
  VALUES (new.text, new.section, new.chunk_id, new.source_document_id, new.page_number);
END;

CREATE TRIGGER document_chunk_ad AFTER DELETE ON document_chunk BEGIN
  DELETE FROM document_chunk_fts WHERE chunk_id = old.chunk_id;
END;

CREATE TRIGGER document_chunk_au AFTER UPDATE ON document_chunk BEGIN
  DELETE FROM document_chunk_fts WHERE chunk_id = old.chunk_id;
  INSERT INTO document_chunk_fts(text, section, chunk_id, source_document_id, page_number)
  VALUES (new.text, new.section, new.chunk_id, new.source_document_id, new.page_number);
END;

CREATE TABLE model_metadata (
  model_id INTEGER PRIMARY KEY,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  model_hash TEXT NOT NULL CHECK(length(model_hash) = 64),
  tokenizer_hash TEXT,
  local_storage_key TEXT,
  UNIQUE(model_name, model_version, model_hash)
);

CREATE TABLE embedding (
  embedding_id INTEGER PRIMARY KEY,
  chunk_id INTEGER NOT NULL REFERENCES document_chunk(chunk_id) ON DELETE CASCADE,
  model_id INTEGER NOT NULL REFERENCES model_metadata(model_id) ON DELETE RESTRICT,
  vector_blob BLOB NOT NULL,
  UNIQUE(chunk_id, model_id)
);

CREATE TABLE audit_log (
  audit_id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, timestamp DESC);

CREATE VIEW filing_value_provenance AS
SELECT
  fv.filing_value_id,
  pc.case_id,
  pc.case_name,
  p.plan_id,
  p.plan_name,
  p.plan_number,
  py.plan_year_id,
  py.year AS plan_year,
  f.filing_id,
  f.efast_filing_id,
  f.source_url,
  ld.schedule_name,
  ld.part,
  ld.location_reference,
  ld.subfield,
  ld.canonical_concept,
  ld.label,
  fv.raw_value,
  fv.normalized_text,
  fv.normalized_number,
  fv.normalized_date,
  fv.extraction_method,
  fv.extraction_confidence,
  fv.verification_status,
  fv.source_page,
  fv.source_text,
  sd.source_document_id,
  sd.filename AS source_filename,
  sd.storage_key,
  sd.sha256 AS source_sha256
FROM filing_value fv
JOIN filing f ON f.filing_id = fv.filing_id
JOIN plan_year py ON py.plan_year_id = f.plan_year_id
JOIN plan p ON p.plan_id = py.plan_id
JOIN pension_case pc ON pc.case_id = p.case_id
JOIN line_definition ld ON ld.line_definition_id = fv.line_definition_id
LEFT JOIN source_document sd ON sd.source_document_id = f.source_document_id;

INSERT OR IGNORE INTO form_definition(form_name, schedule_name, form_year, version)
VALUES ('Form 5500', 'H', 2024, '2024');

INSERT OR IGNORE INTO line_definition(
  form_definition_id, schedule_name, part, location_reference, subfield,
  canonical_concept, label, value_type, unit
)
SELECT form_definition_id, 'H', 'I', '1C9', 'BOY',
       'COMMON_COLLECTIVE_TRUST_VALUE', 'Common/collective trust value', 'INTEGER', 'USD'
FROM form_definition
WHERE form_name='Form 5500' AND schedule_name='H' AND form_year=2024 AND version='2024';

INSERT OR IGNORE INTO line_definition(
  form_definition_id, schedule_name, part, location_reference, subfield,
  canonical_concept, label, value_type, unit
)
SELECT form_definition_id, 'H', 'I', '1C9', 'EOY',
       'COMMON_COLLECTIVE_TRUST_VALUE', 'Common/collective trust value', 'INTEGER', 'USD'
FROM form_definition
WHERE form_name='Form 5500' AND schedule_name='H' AND form_year=2024 AND version='2024';
