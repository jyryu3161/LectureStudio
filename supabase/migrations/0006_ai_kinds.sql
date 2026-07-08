-- ---------------------------------------------------------------------------
-- 0006_ai_kinds — widen ai_artifacts.artifact_type for the MVP4 kinds.
--
-- 0003 pinned artifact_type to the original six kinds via a CHECK constraint.
-- MVP4 (PRD §9.4) adds three more author-side generation kinds. This migration
-- drops and recreates that CHECK so inserts for the new kinds are accepted.
-- No data change: existing rows all use one of the original six values.
-- ---------------------------------------------------------------------------

alter table ai_artifacts
  drop constraint if exists ai_artifacts_artifact_type_check;

alter table ai_artifacts
  add constraint ai_artifacts_artifact_type_check
  check (artifact_type in (
    'outline', 'student-explanation', 'instructor-summary',
    'figure-code', 'code-explanation', 'quiz',
    'animation-code', 'difficulty-adjust', 'revision-from-annotations'
  ));
