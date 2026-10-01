CREATE TABLE "magic_story"."StoryFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'medium',
    "readerInitiallyKnows" BOOLEAN NOT NULL DEFAULT false,
    "plannedRevealChapterId" TEXT,
    "revealedChapterId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoryFact_projectId_idx" ON "magic_story"."StoryFact"("projectId");
CREATE INDEX "StoryFact_plannedRevealChapterId_idx" ON "magic_story"."StoryFact"("plannedRevealChapterId");
CREATE INDEX "StoryFact_revealedChapterId_idx" ON "magic_story"."StoryFact"("revealedChapterId");

ALTER TABLE "magic_story"."StoryFact" ADD CONSTRAINT "StoryFact_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "magic_story"."StoryFact" ADD CONSTRAINT "StoryFact_plannedRevealChapterId_fkey"
FOREIGN KEY ("plannedRevealChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "magic_story"."StoryFact" ADD CONSTRAINT "StoryFact_revealedChapterId_fkey"
FOREIGN KEY ("revealedChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
