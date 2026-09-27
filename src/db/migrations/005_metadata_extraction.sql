-- Milestone 2: metadata-driven structured extraction and deterministic validation.

CREATE TABLE line_extraction_rule (
  extraction_rule_id INTEGER PRIMARY KEY,
  form_definition_id INTEGER NOT NULL REFERENCES form_definition(form_definition_id) ON DELETE CASCADE,
  schedule_name TEXT NOT NULL,
  part TEXT NOT NULL,
  location_reference TEXT NOT NULL,
  label_pattern TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK(strategy IN ('POSITIONAL_BOY_EOY')),
  min_value_x_ratio REAL NOT NULL DEFAULT 0.45 CHECK(min_value_x_ratio >= 0 AND min_value_x_ratio <= 1),
  source_authority TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  source_url TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(form_definition_id, part, location_reference)
);

CREATE INDEX idx_extraction_rule_lookup
  ON line_extraction_rule(form_definition_id, schedule_name, part, location_reference, active);

CREATE TABLE filing_validation_result (
  validation_result_id INTEGER PRIMARY KEY,
  filing_id INTEGER NOT NULL REFERENCES filing(filing_id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  subfield TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('PASS','FAIL','NOT_EVALUATED')),
  severity TEXT NOT NULL CHECK(severity IN ('INFO','WARNING','ERROR')),
  observed_number REAL,
  expected_number REAL,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(filing_id, rule_code, subfield)
);

CREATE INDEX idx_validation_filing
  ON filing_validation_result(filing_id, status, rule_code, subfield);

INSERT OR IGNORE INTO form_definition(form_name, schedule_name, form_year, version)
VALUES ('Form 5500', 'H', 2024, '2024');

-- Additional 2024 Schedule H Part I line definitions. 1C9 already exists in
-- migration 001 and remains the regression baseline.
INSERT OR IGNORE INTO line_definition(
  form_definition_id, schedule_name, part, location_reference, subfield,
  canonical_concept, label, value_type, unit
)
SELECT fd.form_definition_id, 'H', 'I', v.location_reference, s.subfield,
       v.canonical_concept, v.label, 'INTEGER', 'USD'
FROM form_definition fd
JOIN (
  SELECT '1D1' AS location_reference, 'EMPLOYER_SECURITIES_VALUE' AS canonical_concept, 'Employer securities' AS label
  UNION ALL SELECT '1D2', 'EMPLOYER_REAL_PROPERTY_VALUE', 'Employer real property'
  UNION ALL SELECT '1E', 'PLAN_OPERATION_PROPERTY_VALUE', 'Buildings and other property used in plan operation'
  UNION ALL SELECT '1F', 'TOTAL_ASSETS', 'Total assets'
  UNION ALL SELECT '1G', 'BENEFIT_CLAIMS_PAYABLE', 'Benefit claims payable'
  UNION ALL SELECT '1H', 'OPERATING_PAYABLES', 'Operating payables'
  UNION ALL SELECT '1I', 'ACQUISITION_INDEBTEDNESS', 'Acquisition indebtedness'
  UNION ALL SELECT '1J', 'OTHER_LIABILITIES', 'Other liabilities'
  UNION ALL SELECT '1K', 'TOTAL_LIABILITIES', 'Total liabilities'
  UNION ALL SELECT '1L', 'NET_ASSETS', 'Net assets'
) AS v
JOIN (
  SELECT 'BOY' AS subfield
  UNION ALL SELECT 'EOY'
) AS s
WHERE fd.form_name='Form 5500'
  AND fd.schedule_name='H'
  AND fd.form_year=2024
  AND fd.version='2024';

-- Metadata extraction rules. URLs are inert definition provenance only.
INSERT OR IGNORE INTO line_extraction_rule(
  form_definition_id, schedule_name, part, location_reference, label_pattern,
  strategy, min_value_x_ratio, source_authority, source_reference, source_url
)
SELECT fd.form_definition_id, 'H', 'I', r.location_reference, r.label_pattern,
       'POSITIONAL_BOY_EOY', 0.45,
       'U.S. Department of Labor / IRS / PBGC',
       r.source_reference,
       'https://www.dol.gov/agencies/ebsa/employers-and-advisers/plan-administration-and-compliance/reporting-and-filing/form-5500'
FROM form_definition fd
JOIN (
  SELECT '1C9' AS location_reference, 'common.*collective.*trust' AS label_pattern,
         '2024 Schedule H (Form 5500), Part I, line 1c(9)' AS source_reference
  UNION ALL SELECT '1D1', 'employer.*securit', '2024 Schedule H (Form 5500), Part I, line 1d(1)'
  UNION ALL SELECT '1D2', 'employer.*real.*property', '2024 Schedule H (Form 5500), Part I, line 1d(2)'
  UNION ALL SELECT '1E', 'buildings.*property.*plan.*operation', '2024 Schedule H (Form 5500), Part I, line 1e'
  UNION ALL SELECT '1F', 'total.*assets', '2024 Schedule H (Form 5500), Part I, line 1f'
  UNION ALL SELECT '1G', 'benefit.*claims.*payable', '2024 Schedule H (Form 5500), Part I, line 1g'
  UNION ALL SELECT '1H', 'operating.*payables', '2024 Schedule H (Form 5500), Part I, line 1h'
  UNION ALL SELECT '1I', 'acquisition.*indebtedness', '2024 Schedule H (Form 5500), Part I, line 1i'
  UNION ALL SELECT '1J', 'other.*liabilit', '2024 Schedule H (Form 5500), Part I, line 1j'
  UNION ALL SELECT '1K', 'total.*liabilit', '2024 Schedule H (Form 5500), Part I, line 1k'
  UNION ALL SELECT '1L', 'net.*assets', '2024 Schedule H (Form 5500), Part I, line 1l'
) AS r
WHERE fd.form_name='Form 5500'
  AND fd.schedule_name='H'
  AND fd.form_year=2024
  AND fd.version='2024';
