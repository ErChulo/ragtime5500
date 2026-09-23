#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import sqlite3
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DDL = (ROOT / 'src/db/migrations/001_initial.sql').read_text(encoding='utf-8')


def seed(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO pension_case(case_name) VALUES('Example Case')")
    case_id = conn.execute("SELECT case_id FROM pension_case WHERE case_name='Example Case'").fetchone()[0]
    conn.execute("INSERT INTO plan(case_id,plan_name,plan_number) VALUES(?,?,?)", (case_id, 'EXAMPLE PENSION PLAN', '2'))
    plan_id = conn.execute("SELECT plan_id FROM plan WHERE case_id=? AND plan_number='2'", (case_id,)).fetchone()[0]
    conn.execute("INSERT INTO plan_year(plan_id,year) VALUES(?,2024)", (plan_id,))
    plan_year_id = conn.execute("SELECT plan_year_id FROM plan_year WHERE plan_id=? AND year=2024", (plan_id,)).fetchone()[0]
    digest = hashlib.sha256(b'synthetic acceptance PDF placeholder').hexdigest()
    conn.execute("""INSERT INTO source_document(filename,storage_key,mime_type,sha256,file_size,source_type)
                    VALUES('acceptance-fixture.pdf','fixture/acceptance-fixture.pdf','application/pdf',?,34,'FORM_5500_PDF')""", (digest,))
    doc_id = conn.execute("SELECT source_document_id FROM source_document WHERE sha256=?", (digest,)).fetchone()[0]
    conn.execute("INSERT INTO filing(plan_year_id,filing_type,source_document_id,filing_status) VALUES(?,'FORM_5500',?,'PARSED')", (plan_year_id, doc_id))
    filing_id = conn.execute("SELECT filing_id FROM filing WHERE plan_year_id=?", (plan_year_id,)).fetchone()[0]
    for subfield, value in [('BOY', 1250000), ('EOY', 1175000)]:
        line_id = conn.execute("""SELECT ld.line_definition_id FROM line_definition ld
            JOIN form_definition fd ON fd.form_definition_id=ld.form_definition_id
            WHERE fd.form_year=2024 AND ld.schedule_name='H' AND ld.part='I'
            AND ld.location_reference='1C9' AND ld.subfield=?""", (subfield,)).fetchone()[0]
        conn.execute("""INSERT INTO filing_value(
            filing_id,line_definition_id,raw_value,normalized_number,extraction_method,
            extraction_confidence,verification_status,source_page,source_text)
            VALUES(?,?,?,?,?,?,?,?,?)""", (filing_id, line_id, str(value), value, 'SYNTHETIC_ACCEPTANCE_FIXTURE', 1.0, 'USER_VERIFIED', 7, 'synthetic line fixture'))
    conn.commit()


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / 'ragtime5500.sqlite3'
        conn = sqlite3.connect(path)
        conn.executescript(DDL)
        seed(conn)
        fk = conn.execute('PRAGMA foreign_key_check').fetchall()
        assert fk == [], fk
        fts = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='document_chunk_fts'").fetchone()
        assert fts is not None
        doc_id = conn.execute("SELECT source_document_id FROM source_document LIMIT 1").fetchone()[0]
        conn.execute("INSERT INTO document_chunk(source_document_id,page_number,section,text,chunk_order) VALUES(?,7,'Schedule H','common collective trust 1175000',0)", (doc_id,))
        fts_hit = conn.execute("SELECT page_number FROM document_chunk_fts WHERE document_chunk_fts MATCH 'collective'").fetchone()
        assert fts_hit == (7,), fts_hit

        concept_rows = conn.execute("""SELECT ld.subfield,fv.normalized_number FROM filing_value fv
            JOIN filing f ON f.filing_id=fv.filing_id
            JOIN plan_year py ON py.plan_year_id=f.plan_year_id
            JOIN line_definition ld ON ld.line_definition_id=fv.line_definition_id
            WHERE py.year=2024 AND ld.canonical_concept='COMMON_COLLECTIVE_TRUST_VALUE'
            ORDER BY ld.subfield""").fetchall()
        assert concept_rows == [('BOY', 1250000.0), ('EOY', 1175000.0)], concept_rows

        acceptance_sql = """
        SELECT fv.normalized_number
        FROM filing_value fv
        JOIN filing f ON f.filing_id = fv.filing_id
        JOIN plan_year py ON py.plan_year_id = f.plan_year_id
        JOIN line_definition ld ON ld.line_definition_id = fv.line_definition_id
        WHERE py.year = 2024
          AND ld.schedule_name = 'H'
          AND ld.part = 'I'
          AND ld.location_reference = '1C9'
          AND ld.subfield = 'EOY';
        """
        eoy = conn.execute(acceptance_sql).fetchone()[0]
        assert eoy == 1175000, eoy
        boy = conn.execute(acceptance_sql.replace("'EOY'", "'BOY'")).fetchone()[0]
        assert boy == 1250000, boy

        fv_id = conn.execute("""SELECT fv.filing_value_id FROM filing_value fv
            JOIN line_definition ld ON ld.line_definition_id=fv.line_definition_id
            WHERE ld.location_reference='1C9' AND ld.subfield='EOY'""").fetchone()[0]
        old = conn.execute("SELECT * FROM filing_value WHERE filing_value_id=?", (fv_id,)).fetchone()
        conn.execute("""INSERT INTO filing_value_revision(
            filing_value_id,revision_reason,raw_value,normalized_text,normalized_number,normalized_date,
            extraction_method,extraction_confidence,verification_status,source_page,source_text)
            SELECT filing_value_id,'test correction',raw_value,normalized_text,normalized_number,normalized_date,
            extraction_method,extraction_confidence,verification_status,source_page,source_text
            FROM filing_value WHERE filing_value_id=?""", (fv_id,))
        conn.execute("UPDATE filing_value SET normalized_number=1175001,verification_status='USER_CORRECTED' WHERE filing_value_id=?", (fv_id,))
        revision = conn.execute("SELECT normalized_number FROM filing_value_revision WHERE filing_value_id=?", (fv_id,)).fetchone()[0]
        assert revision == old[5] == 1175000
        conn.commit()
        conn.close()

        backup = Path(td) / 'backup.sqlite3'
        backup.write_bytes(path.read_bytes())
        restored = sqlite3.connect(backup)
        assert restored.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert restored.execute("SELECT COUNT(*) FROM filing_value").fetchone()[0] == 2
        restored.close()

    print('SCHEMA / ACCEPTANCE SQL / REVISION / BACKUP TEST: PASS')
    print('EOY = 1175000; BOY = 1250000')
    print('NOTE: values above are a synthetic schema fixture, not proof of any real source PDF page.')

if __name__ == '__main__':
    main()
