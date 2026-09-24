-- Domain invariant: one Ragtime case is exactly one pension plan.
-- The plan table remains only as an internal relational compatibility row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_one_per_case
  ON plan(case_id);
