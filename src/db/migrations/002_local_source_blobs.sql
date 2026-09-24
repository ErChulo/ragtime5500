CREATE TABLE local_file_blob (
  storage_key TEXT PRIMARY KEY,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER source_document_blob_delete
AFTER DELETE ON source_document
BEGIN
  DELETE FROM local_file_blob WHERE storage_key = old.storage_key;
END;
