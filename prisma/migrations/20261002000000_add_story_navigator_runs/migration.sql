CREATE TABLE "magic_story"."StoryNavigatorRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "anchorChapterId" TEXT NOT NULL,
    "request" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL,
    "contextBuilderVersion" TEXT NOT NULL,
    "sourceManifest" TEXT NOT NULL,
    "authorIntentSnapshot" TEXT NOT NULL DEFAULT '',
    "genreGuidanceModeSnapshot" TEXT NOT NULL DEFAULT 'reference',
    "genreGuidanceNotesSnapshot" TEXT NOT NULL DEFAULT '',
    "currentPositionSummary" TEXT NOT NULL DEFAULT '',
    "planDeviation" TEXT NOT NULL DEFAULT '[]',
    "rawResponse" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "StoryNavigatorRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "magic_story"."StoryNavigatorProposal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyPossible" TEXT NOT NULL,
    "authorIntentRelation" TEXT NOT NULL,
    "preparation" TEXT NOT NULL DEFAULT '[]',
    "affectedEntities" TEXT NOT NULL DEFAULT '[]',
    "benefits" TEXT NOT NULL DEFAULT '[]',
    "risks" TEXT NOT NULL DEFAULT '[]',
    "immediateOptions" TEXT NOT NULL DEFAULT '[]',
    "decisionStatus" TEXT NOT NULL DEFAULT 'undecided',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "StoryNavigatorProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoryNavigatorRun_projectId_createdAt_idx" ON "magic_story"."StoryNavigatorRun"("projectId", "createdAt");
CREATE INDEX "StoryNavigatorRun_anchorChapterId_idx" ON "magic_story"."StoryNavigatorRun"("anchorChapterId");
CREATE UNIQUE INDEX "StoryNavigatorProposal_runId_routeKey_key" ON "magic_story"."StoryNavigatorProposal"("runId", "routeKey");
CREATE INDEX "StoryNavigatorProposal_runId_decisionStatus_idx" ON "magic_story"."StoryNavigatorProposal"("runId", "decisionStatus");

ALTER TABLE "magic_story"."StoryNavigatorRun" ADD CONSTRAINT "StoryNavigatorRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorRun" ADD CONSTRAINT "StoryNavigatorRun_anchorChapterId_fkey" FOREIGN KEY ("anchorChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorProposal" ADD CONSTRAINT "StoryNavigatorProposal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "magic_story"."StoryNavigatorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
