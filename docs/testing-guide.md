# Ragtime 5500 — Manual Test Drive

This guide is written for a first-time tester. Do one step at a time. Do not move forward until the expected result appears.

The purpose is not only to find defects. It is also a tour of what Milestone 1 can do.

## Before you begin

Use a copy of the current `ragtime5500.html`. Keep your test files local. Do not upload real case files to GitHub.

Have these available if possible:

- one eFAST export CSV;
- the matching locally downloaded Form 5500 PDF;
- the designated 2024 filing used for Schedule H Part I 1C9 verification.

For the designated acceptance filing, the expected Schedule H Part I 1C9 values are:

- BOY = 1,133,669
- EOY = 957,892

## Test 1 — Open Ragtime

**Do:** Double-click `ragtime5500.html` and open it in Chrome.

**Expect:** You see **Offline** and **Choose workspace**. You see only two primary choices: **Open my existing workspace** and **Create a new workspace**.

**This proves:** The single HTML application starts directly from `file://` without a server.

## Test 2 — Create or open the workspace

**Do:** If this is your first run, choose **Create a new workspace**. Save the file somewhere obvious, for example:

`Ragtime Testing\ragtime5500-workspace.sqlite3`

If you already created one, choose **Open my existing workspace** and select it.

**Expect:** The header shows the workspace filename. The first screen asks **What do you want to do?**

**This proves:** Ragtime can use a normal local SQLite file as persistent case storage.

## Test 3 — Use the built-in test guide

**Do:** Choose **Test Ragtime step by step**.

**Expect:** Ragtime shows only one test instruction at a time, with:

- **Do this now**
- **What you should see**
- **What this proves**

Use **Guide** at the top to return to the instructions whenever you lose your place.

**This proves:** The application can act as its own operating guide and cheat sheet.

## Test 4 — Build the filing context

**Do:** From the test guide choose **Go to case setup**.

Create or select, in order:

1. Case
2. Plan
3. Plan Year
4. Filing

Only the current decision should be visible. Optional edit/delete fields should stay collapsed.

**Expect:** At the end, Ragtime says the filing context is ready.

**This proves:** Ragtime stores the authoritative hierarchy:

`Case → Plan → Plan Year → Filing`

## Test 5 — Import the eFAST CSV

**Do:** Return to **Guide**, advance to the eFAST CSV step, then choose **Go to import**.

Select the local eFAST CSV.

**Expect:**

- Ragtime reports the imported row count.
- Raw rows are preserved.
- The eFAST Link is stored as provenance text only.
- Ragtime does not open or retrieve the URL.

**This proves:** eFAST metadata can be imported without any network use.

## Test 6 — Import the local PDFs

**Do:** Continue to the PDF substep. Select one or more locally downloaded Form 5500 PDFs.

**Expect:** For each PDF Ragtime records the local filename, SHA-256, file size, extracted text, and a document-match status.

Possible match states include:

- auto-accepted;
- ambiguous;
- unmatched.

**This proves:** Ragtime can ingest local evidence and match it to the eFAST filing without requiring manual renaming.

## Test 7 — Review uncertain matches

**Do:** Return to **Guide**, advance to review, then choose **Go to review**.

If a PDF is ambiguous or unmatched, resolve it manually.

**Expect:** Your decision is stored in the audit history. The original match evidence is preserved.

**This proves:** Uncertain automation is routed to review instead of being silently guessed.

## Test 8 — Verify Schedule H Part I 1C9

**Do:** Review the extracted values for the designated 2024 filing.

**Expect:** Ragtime identifies:

`Schedule H → Part I → 1C9 → BOY / EOY`

For the acceptance filing, verify against the PDF page:

`BOY = 1133669`

`EOY = 957892`

Also verify that the value displays its:

- source PDF;
- source page;
- source text;
- extraction method;
- confidence;
- verification status.

**This proves:** A structured Form 5500 value remains traceable to the source page.

## Test 9 — Query an exact value from SQLite

**Do:** Return to **Guide**, advance to the exact-query step, then choose **Go to exact query**.

Query:

- Plan Year = 2024
- Schedule = H
- Part = I
- Location = 1C9
- Subfield = EOY

**Expect:** The structured result is `957892` for the designated acceptance filing, with provenance.

**This proves:** Exact factual questions are answered from the authoritative SQLite data rather than from RAG or an LLM.

## Test 10 — Try canonical-concept search

**Do:** In **Find values**, change the mode to **Concept history** and search for:

`COMMON_COLLECTIVE_TRUST_VALUE`

**Expect:** Ragtime retrieves values associated with that canonical concept independently of the literal Form 5500 line number.

**This proves:** Historical comparison can use stable business concepts even when form layouts later change.

## Test 11 — Try document-text search

**Do:** In **Find values**, change the mode to **Document text** and search for a phrase you know appears in the imported filing.

**Expect:** Ragtime returns local document chunks and source-page evidence.

**This proves:** Local FTS5 retrieval supports document discovery without making the RAG layer authoritative for structured facts.

## Test 12 — Test correction provenance

**Do:** In the extracted-value review, correct a test value only if you have source evidence for the correction.

**Expect:** Ragtime retains the prior extracted value and records the correction in the audit trail.

**This proves:** A user correction does not destroy the original extraction.

## Test 13 — Export a backup

**Do:** Return to **Guide**, advance to backup, then choose **Go to backup**.

Export the SQLite database.

**Expect:** A local SQLite backup file is produced.

**This proves:** The case database is portable and recoverable.

## Test 14 — Test persistence

**Do:** Close every Chrome window. Reopen `ragtime5500.html`. Choose **Open my existing workspace** and select the same `.sqlite3` file.

Rerun the exact 1C9 EOY query.

**Expect:** The case, imported evidence, and extracted value are still present.

**This proves:** Persistence does not depend on a server or browser-private OPFS storage.

## Test 15 — Test workstation restart

**Do:** Restart Windows. Reopen the HTML and the same workspace file. Rerun the exact query.

**Expect:** The same data is present.

**This proves:** Persistence survives a workstation restart.

## Test 16 — Verify zero network activity

**Do:** Disconnect the workstation from the network. Open Chrome DevTools → Network. Clear the Network log. Repeat a representative workflow:

open workspace → query value → view source evidence → backup.

**Expect:** No outbound runtime requests appear.

**This proves:** The office runtime is air-gapped and does not require internet connectivity.

## Milestone 1 pass condition

Milestone 1 is not complete until the real designated filing passes the source-page verification, persistence, backup/restore, and zero-network tests above.

The automated GitHub CI checks are necessary, but they do not replace the target-workstation test.
