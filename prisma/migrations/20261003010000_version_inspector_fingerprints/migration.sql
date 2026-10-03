-- Existing Inspector records were created with the pre-versioned legacy algorithm.
-- Services explicitly write semantic-v2 for new records; the DB default keeps
-- old and out-of-band records conservative rather than silently upgrading them.
ALTER TABLE "magic_story"."NarrativeInspectionRun"
ADD COLUMN "fingerprintVersion" TEXT NOT NULL DEFAULT 'legacy-v1';

ALTER TABLE "magic_story"."NarrativeIssue"
ADD COLUMN "fingerprintVersion" TEXT NOT NULL DEFAULT 'legacy-v1';

ALTER TABLE "magic_story"."NarrativeIssueDecision"
ADD COLUMN "fingerprintVersion" TEXT NOT NULL DEFAULT 'legacy-v1';

ALTER TABLE "magic_story"."NarrativeLearningSession"
ADD COLUMN "fingerprintVersion" TEXT NOT NULL DEFAULT 'legacy-v1';
