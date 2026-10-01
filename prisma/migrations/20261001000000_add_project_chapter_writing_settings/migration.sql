ALTER TABLE "magic_story"."Project"
ADD COLUMN "narrativePerspective" TEXT,
ADD COLUMN "defaultPovCharacterId" TEXT,
ADD COLUMN "povNotes" TEXT NOT NULL DEFAULT '',
ADD COLUMN "writingStyleNotes" TEXT NOT NULL DEFAULT '',
ADD COLUMN "defaultChapterTarget" INTEGER,
ADD COLUMN "chapterLengthPolicy" TEXT NOT NULL DEFAULT 'guide',
ADD COLUMN "formattingNotes" TEXT NOT NULL DEFAULT '';

ALTER TABLE "magic_story"."Chapter"
ADD COLUMN "povCharacterId" TEXT,
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT '',
ADD COLUMN "targetWordCount" INTEGER,
ADD COLUMN "endingNotes" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Project_defaultPovCharacterId_idx" ON "magic_story"."Project"("defaultPovCharacterId");
CREATE INDEX "Chapter_povCharacterId_idx" ON "magic_story"."Chapter"("povCharacterId");

ALTER TABLE "magic_story"."Project" ADD CONSTRAINT "Project_defaultPovCharacterId_fkey"
FOREIGN KEY ("defaultPovCharacterId") REFERENCES "magic_story"."Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "magic_story"."Chapter" ADD CONSTRAINT "Chapter_povCharacterId_fkey"
FOREIGN KEY ("povCharacterId") REFERENCES "magic_story"."Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
