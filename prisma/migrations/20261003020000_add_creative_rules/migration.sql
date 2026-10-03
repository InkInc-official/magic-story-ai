CREATE TABLE "magic_story"."ProjectCreativeTechnique" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "techniqueKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'reference',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "overridable" BOOLEAN NOT NULL DEFAULT true,
    "authorAdjustment" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'author',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "catalogContractVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectCreativeTechnique_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectCreativeTechnique_mode_check" CHECK ("mode" IN ('off', 'reference', 'required', 'forbidden')),
    CONSTRAINT "ProjectCreativeTechnique_priority_check" CHECK ("priority" BETWEEN -100 AND 100),
    CONSTRAINT "ProjectCreativeTechnique_key_check" CHECK (char_length(btrim("techniqueKey", E' \t\n\r')) BETWEEN 1 AND 120),
    CONSTRAINT "ProjectCreativeTechnique_adjustment_length_check" CHECK (char_length("authorAdjustment") <= 2000),
    CONSTRAINT "ProjectCreativeTechnique_notes_length_check" CHECK (char_length("notes") <= 1000),
    CONSTRAINT "ProjectCreativeTechnique_source_check" CHECK ("source" IN ('author', 'imported', 'ai_suggested_then_confirmed')),
    CONSTRAINT "ProjectCreativeTechnique_contract_version_check" CHECK ("catalogContractVersion" >= 1)
);

CREATE TABLE "magic_story"."ProjectCustomCreativeRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'reference',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "overridable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'author',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectCustomCreativeRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectCustomCreativeRule_title_check" CHECK (char_length(btrim("title", E' \t\n\r')) BETWEEN 1 AND 120 AND char_length("title") <= 120),
    CONSTRAINT "ProjectCustomCreativeRule_instruction_check" CHECK (char_length(btrim("instruction", E' \t\n\r')) >= 1 AND char_length("instruction") <= 2000),
    CONSTRAINT "ProjectCustomCreativeRule_category_check" CHECK ("category" IN ('description', 'psychology', 'dialogue', 'rhythm', 'style', 'scene', 'chapter', 'information', 'tension', 'structure', 'character', 'reader_experience')),
    CONSTRAINT "ProjectCustomCreativeRule_mode_check" CHECK ("mode" IN ('reference', 'required', 'forbidden')),
    CONSTRAINT "ProjectCustomCreativeRule_priority_check" CHECK ("priority" BETWEEN -100 AND 100),
    CONSTRAINT "ProjectCustomCreativeRule_notes_length_check" CHECK (char_length("notes") <= 1000),
    CONSTRAINT "ProjectCustomCreativeRule_source_check" CHECK ("source" IN ('author', 'imported', 'ai_suggested_then_confirmed'))
);

CREATE UNIQUE INDEX "ProjectCreativeTechnique_projectId_techniqueKey_key" ON "magic_story"."ProjectCreativeTechnique"("projectId", "techniqueKey");
CREATE INDEX "ProjectCreativeTechnique_projectId_active_priority_idx" ON "magic_story"."ProjectCreativeTechnique"("projectId", "active", "priority");
CREATE INDEX "ProjectCustomCreativeRule_projectId_active_priority_idx" ON "magic_story"."ProjectCustomCreativeRule"("projectId", "active", "priority");

ALTER TABLE "magic_story"."ProjectCreativeTechnique" ADD CONSTRAINT "ProjectCreativeTechnique_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."ProjectCustomCreativeRule" ADD CONSTRAINT "ProjectCustomCreativeRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
