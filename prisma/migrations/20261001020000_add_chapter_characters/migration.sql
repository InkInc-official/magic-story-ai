CREATE TABLE "magic_story"."ChapterCharacter" (
    "chapterId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "participation" TEXT NOT NULL DEFAULT 'present',
    "notes" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChapterCharacter_pkey" PRIMARY KEY ("chapterId", "characterId")
);

CREATE INDEX "ChapterCharacter_characterId_idx" ON "magic_story"."ChapterCharacter"("characterId");

ALTER TABLE "magic_story"."ChapterCharacter" ADD CONSTRAINT "ChapterCharacter_chapterId_fkey"
FOREIGN KEY ("chapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "magic_story"."ChapterCharacter" ADD CONSTRAINT "ChapterCharacter_characterId_fkey"
FOREIGN KEY ("characterId") REFERENCES "magic_story"."Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
