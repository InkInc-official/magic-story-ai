CREATE TABLE "magic_story"."NarratorProfile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "voiceNotes" TEXT NOT NULL DEFAULT '',
    "linkedCharacterId" TEXT,
    "identityFactId" TEXT,
    "identityDisclosureMode" TEXT NOT NULL DEFAULT 'normal',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NarratorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "magic_story"."NarrativeRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'author',
    "machineKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "overridable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NarrativeRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "magic_story"."Project" ADD COLUMN "defaultNarratorId" TEXT;
ALTER TABLE "magic_story"."Chapter" ADD COLUMN "narratorId" TEXT;

CREATE INDEX "NarratorProfile_projectId_idx" ON "magic_story"."NarratorProfile"("projectId");
CREATE INDEX "NarratorProfile_linkedCharacterId_idx" ON "magic_story"."NarratorProfile"("linkedCharacterId");
CREATE INDEX "NarratorProfile_identityFactId_idx" ON "magic_story"."NarratorProfile"("identityFactId");
CREATE INDEX "NarrativeRule_projectId_active_priority_idx" ON "magic_story"."NarrativeRule"("projectId", "active", "priority");
CREATE INDEX "Project_defaultNarratorId_idx" ON "magic_story"."Project"("defaultNarratorId");
CREATE INDEX "Chapter_narratorId_idx" ON "magic_story"."Chapter"("narratorId");

ALTER TABLE "magic_story"."NarratorProfile" ADD CONSTRAINT "NarratorProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarratorProfile" ADD CONSTRAINT "NarratorProfile_linkedCharacterId_fkey" FOREIGN KEY ("linkedCharacterId") REFERENCES "magic_story"."Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarratorProfile" ADD CONSTRAINT "NarratorProfile_identityFactId_fkey" FOREIGN KEY ("identityFactId") REFERENCES "magic_story"."StoryFact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "magic_story"."NarrativeRule" ADD CONSTRAINT "NarrativeRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."Project" ADD CONSTRAINT "Project_defaultNarratorId_fkey" FOREIGN KEY ("defaultNarratorId") REFERENCES "magic_story"."NarratorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "magic_story"."Chapter" ADD CONSTRAINT "Chapter_narratorId_fkey" FOREIGN KEY ("narratorId") REFERENCES "magic_story"."NarratorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
