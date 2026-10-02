CREATE TABLE "magic_story"."NarrativeLearningSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "startingIssueFingerprint" TEXT NOT NULL,
    "startingContentHash" TEXT NOT NULL,
    "startingContextFingerprint" TEXT NOT NULL,
    "issueExcerptSnapshot" TEXT NOT NULL,
    "issueExplanationSnapshot" TEXT NOT NULL,
    "evidenceRefsSnapshot" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentHintLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "NarrativeLearningSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NarrativeLearningSession_status_check" CHECK ("status" IN ('active', 'completed', 'stale', 'abandoned')),
    CONSTRAINT "NarrativeLearningSession_hint_level_check" CHECK ("currentHintLevel" BETWEEN 0 AND 2)
);

CREATE TABLE "magic_story"."NarrativeLearningStep" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contextFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NarrativeLearningStep_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NarrativeLearningStep_level_check" CHECK ("level" BETWEEN 0 AND 2),
    CONSTRAINT "NarrativeLearningStep_type_check" CHECK ("type" IN ('question', 'hint1', 'hint2'))
);

CREATE INDEX "NarrativeLearningSession_projectId_chapterId_status_idx" ON "magic_story"."NarrativeLearningSession"("projectId", "chapterId", "status");
CREATE INDEX "NarrativeLearningSession_issueId_createdAt_idx" ON "magic_story"."NarrativeLearningSession"("issueId", "createdAt");
-- Preserve completed/stale history while preventing concurrent active sessions
-- for the same Issue. The service reuses the winning row on a race.
CREATE UNIQUE INDEX "NarrativeLearningSession_one_active_per_issue_key" ON "magic_story"."NarrativeLearningSession"("issueId") WHERE "status" = 'active';
CREATE UNIQUE INDEX "NarrativeLearningStep_sessionId_level_key" ON "magic_story"."NarrativeLearningStep"("sessionId", "level");
CREATE INDEX "NarrativeLearningStep_sessionId_createdAt_idx" ON "magic_story"."NarrativeLearningStep"("sessionId", "createdAt");

ALTER TABLE "magic_story"."NarrativeLearningSession" ADD CONSTRAINT "NarrativeLearningSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeLearningSession" ADD CONSTRAINT "NarrativeLearningSession_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeLearningSession" ADD CONSTRAINT "NarrativeLearningSession_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "magic_story"."NarrativeIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeLearningStep" ADD CONSTRAINT "NarrativeLearningStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "magic_story"."NarrativeLearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
