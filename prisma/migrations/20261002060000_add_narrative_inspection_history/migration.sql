CREATE TABLE "magic_story"."NarrativeInspectionRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "requestedStartOffset" INTEGER NOT NULL,
    "requestedEndOffset" INTEGER NOT NULL,
    "inspectedStartOffset" INTEGER,
    "inspectedEndOffset" INTEGER,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "contextManifest" TEXT NOT NULL DEFAULT '',
    "contextFingerprint" TEXT NOT NULL DEFAULT '',
    "inspectorVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "NarrativeInspectionRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NarrativeInspectionRun_status_check" CHECK ("status" IN ('pending', 'completed', 'failed'))
);

CREATE TABLE "magic_story"."NarrativeIssue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "firstDetectedRunId" TEXT NOT NULL,
    "lastSeenRunId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "locationKind" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "excerpt" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "suggestedDirection" TEXT NOT NULL,
    "evidenceRefs" TEXT NOT NULL DEFAULT '[]',
    "adjustments" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "contentHash" TEXT NOT NULL,
    "contextFingerprint" TEXT NOT NULL,
    "inspectorVersion" TEXT NOT NULL,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NarrativeIssue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NarrativeIssue_status_check" CHECK ("status" IN ('open', 'resolved', 'stale', 'superseded'))
);

CREATE TABLE "magic_story"."NarrativeIssueDecision" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "authorNote" TEXT NOT NULL DEFAULT '',
    "issueFingerprint" TEXT NOT NULL,
    "decidedAgainstContentHash" TEXT NOT NULL,
    "decidedAgainstExcerpt" TEXT NOT NULL,
    "contextFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NarrativeIssueDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NarrativeIssueDecision_decision_check" CHECK ("decision" IN ('accepted_issue', 'allowed_exception', 'not_an_issue'))
);

CREATE INDEX "NarrativeInspectionRun_projectId_chapterId_createdAt_idx" ON "magic_story"."NarrativeInspectionRun"("projectId", "chapterId", "createdAt");
CREATE INDEX "NarrativeInspectionRun_chapterId_status_idx" ON "magic_story"."NarrativeInspectionRun"("chapterId", "status");
CREATE UNIQUE INDEX "NarrativeIssue_projectId_chapterId_fingerprint_key" ON "magic_story"."NarrativeIssue"("projectId", "chapterId", "fingerprint");
CREATE INDEX "NarrativeIssue_chapterId_status_lastDetectedAt_idx" ON "magic_story"."NarrativeIssue"("chapterId", "status", "lastDetectedAt");
CREATE INDEX "NarrativeIssue_firstDetectedRunId_idx" ON "magic_story"."NarrativeIssue"("firstDetectedRunId");
CREATE INDEX "NarrativeIssue_lastSeenRunId_idx" ON "magic_story"."NarrativeIssue"("lastSeenRunId");
CREATE INDEX "NarrativeIssueDecision_issueId_createdAt_idx" ON "magic_story"."NarrativeIssueDecision"("issueId", "createdAt");

-- Inspection history belongs to its Chapter. Chapter deletion keeps normal UX and
-- cascades that local history; evidence references remain snapshots, not FKs.
ALTER TABLE "magic_story"."NarrativeInspectionRun" ADD CONSTRAINT "NarrativeInspectionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeInspectionRun" ADD CONSTRAINT "NarrativeInspectionRun_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeIssue" ADD CONSTRAINT "NarrativeIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeIssue" ADD CONSTRAINT "NarrativeIssue_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeIssue" ADD CONSTRAINT "NarrativeIssue_firstDetectedRunId_fkey" FOREIGN KEY ("firstDetectedRunId") REFERENCES "magic_story"."NarrativeInspectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeIssue" ADD CONSTRAINT "NarrativeIssue_lastSeenRunId_fkey" FOREIGN KEY ("lastSeenRunId") REFERENCES "magic_story"."NarrativeInspectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeIssueDecision" ADD CONSTRAINT "NarrativeIssueDecision_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "magic_story"."NarrativeIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
