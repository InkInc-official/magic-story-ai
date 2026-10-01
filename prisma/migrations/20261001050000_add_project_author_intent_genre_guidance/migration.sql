ALTER TABLE "magic_story"."Project"
ADD COLUMN "authorIntent" TEXT NOT NULL DEFAULT '',
ADD COLUMN "genreGuidanceMode" TEXT NOT NULL DEFAULT 'reference',
ADD COLUMN "genreGuidanceNotes" TEXT NOT NULL DEFAULT '';
