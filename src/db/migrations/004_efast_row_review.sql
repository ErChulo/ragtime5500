-- Review-gated eFAST ingestion.
-- Preserve every raw CSV row first. Only user-confirmed target rows may create
-- expected Form 5500 filings or participate in PDF matching.

ALTER TABLE efast_import ADD COLUMN case_id INTEGER REFERENCES pension_case(case_id) ON DELETE CASCADE;

ALTER TABLE efast_import_row ADD COLUMN classification_status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW'
  CHECK(classification_status IN ('NEEDS_REVIEW','TARGET_FORM_5500','NON_TARGET'));

ALTER TABLE efast_import_row ADD COLUMN classification_reason TEXT;

ALTER TABLE efast_import_row ADD COLUMN included_for_matching INTEGER NOT NULL DEFAULT 0
  CHECK(included_for_matching IN (0,1));

ALTER TABLE efast_import_row ADD COLUMN user_verified INTEGER NOT NULL DEFAULT 0
  CHECK(user_verified IN (0,1));

CREATE INDEX IF NOT EXISTS idx_efast_row_classification
  ON efast_import_row(efast_import_id, classification_status, row_number);

CREATE INDEX IF NOT EXISTS idx_efast_row_included
  ON efast_import_row(included_for_matching, plan_year);
