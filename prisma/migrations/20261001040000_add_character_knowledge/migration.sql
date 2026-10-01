CREATE TABLE "magic_story"."CharacterKnowledge" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effectiveChapterId" TEXT,
    "beliefNotes" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CharacterKnowledge_factId_idx" ON "magic_story"."CharacterKnowledge"("factId");
CREATE INDEX "CharacterKnowledge_characterId_idx" ON "magic_story"."CharacterKnowledge"("characterId");
CREATE INDEX "CharacterKnowledge_effectiveChapterId_idx" ON "magic_story"."CharacterKnowledge"("effectiveChapterId");

-- PostgreSQL UNIQUE permits multiple NULL values. Enforce one story-start event
-- per fact/character separately from the unique chapter-event timeline points.
CREATE UNIQUE INDEX "CharacterKnowledge_story_start_key"
ON "magic_story"."CharacterKnowledge"("factId", "characterId")
WHERE "effectiveChapterId" IS NULL;

CREATE UNIQUE INDEX "CharacterKnowledge_chapter_point_key"
ON "magic_story"."CharacterKnowledge"("factId", "characterId", "effectiveChapterId")
WHERE "effectiveChapterId" IS NOT NULL;

ALTER TABLE "magic_story"."CharacterKnowledge" ADD CONSTRAINT "CharacterKnowledge_factId_fkey"
FOREIGN KEY ("factId") REFERENCES "magic_story"."StoryFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "magic_story"."CharacterKnowledge" ADD CONSTRAINT "CharacterKnowledge_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "magic_story"."Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "magic_story"."CharacterKnowledge" ADD CONSTRAINT "CharacterKnowledge_effectiveChapterId_fkey"
FOREIGN KEY ("effectiveChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
