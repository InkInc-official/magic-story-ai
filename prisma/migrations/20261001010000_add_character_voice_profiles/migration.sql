ALTER TABLE "magic_story"."Character"
ADD COLUMN "firstPerson" TEXT NOT NULL DEFAULT '',
ADD COLUMN "defaultSecondPerson" TEXT NOT NULL DEFAULT '',
ADD COLUMN "speechRegister" TEXT NOT NULL DEFAULT '',
ADD COLUMN "speechStyleNotes" TEXT NOT NULL DEFAULT '',
ADD COLUMN "narrationVoiceNotes" TEXT NOT NULL DEFAULT '';

ALTER TABLE "magic_story"."CharacterRelationship"
ADD COLUMN "addressTerm" TEXT NOT NULL DEFAULT '',
ADD COLUMN "speechRegister" TEXT NOT NULL DEFAULT '',
ADD COLUMN "speechStyleNotes" TEXT NOT NULL DEFAULT '';
