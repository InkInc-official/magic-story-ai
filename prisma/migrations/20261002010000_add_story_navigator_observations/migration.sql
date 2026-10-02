CREATE TABLE "magic_story"."StoryNavigatorExplorationRun" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "anchorChapterId" TEXT NOT NULL,
  "rangeMode" TEXT NOT NULL DEFAULT 'all', "startChapterId" TEXT, "endChapterId" TEXT, "recentCount" INTEGER,
  "promptVersion" TEXT NOT NULL, "sourceManifest" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT NOT NULL DEFAULT '', "processedBatches" INTEGER NOT NULL DEFAULT 0, "totalBatches" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "StoryNavigatorExplorationRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "magic_story"."StoryNavigatorObservation" (
  "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "sourceChapterId" TEXT NOT NULL,
  "sourceChapterOrder" INTEGER NOT NULL, "sourceChapterTitle" TEXT NOT NULL, "sourceExcerpt" TEXT NOT NULL,
  "elementSummary" TEXT NOT NULL, "reasonInteresting" TEXT NOT NULL, "possibleUses" TEXT NOT NULL DEFAULT '[]',
  "currentStoryRelation" TEXT NOT NULL DEFAULT '', "authorIntentRelation" TEXT NOT NULL DEFAULT '', "risks" TEXT NOT NULL DEFAULT '[]',
  "relevance" TEXT NOT NULL DEFAULT 'medium', "decisionStatus" TEXT NOT NULL DEFAULT 'undecided',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "decidedAt" TIMESTAMP(3),
  CONSTRAINT "StoryNavigatorObservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoryNavigatorExplorationRun_projectId_createdAt_idx" ON "magic_story"."StoryNavigatorExplorationRun"("projectId", "createdAt");
CREATE INDEX "StoryNavigatorExplorationRun_anchorChapterId_idx" ON "magic_story"."StoryNavigatorExplorationRun"("anchorChapterId");
CREATE INDEX "StoryNavigatorObservation_runId_decisionStatus_idx" ON "magic_story"."StoryNavigatorObservation"("runId", "decisionStatus");
CREATE INDEX "StoryNavigatorObservation_projectId_sourceChapterId_idx" ON "magic_story"."StoryNavigatorObservation"("projectId", "sourceChapterId");
ALTER TABLE "magic_story"."StoryNavigatorExplorationRun" ADD CONSTRAINT "StoryNavigatorExplorationRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorExplorationRun" ADD CONSTRAINT "StoryNavigatorExplorationRun_anchorChapterId_fkey" FOREIGN KEY ("anchorChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorObservation" ADD CONSTRAINT "StoryNavigatorObservation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "magic_story"."StoryNavigatorExplorationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorObservation" ADD CONSTRAINT "StoryNavigatorObservation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorObservation" ADD CONSTRAINT "StoryNavigatorObservation_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
