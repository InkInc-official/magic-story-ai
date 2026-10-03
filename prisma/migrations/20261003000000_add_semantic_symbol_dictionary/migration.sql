CREATE TABLE "magic_story"."ProjectSymbolDefinition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "openSymbol" TEXT NOT NULL,
    "closeSymbol" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "defaultUsageRuleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectSymbolDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "magic_story"."SymbolUsageRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "semanticKind" TEXT NOT NULL,
    "countsAsDialogue" BOOLEAN,
    "countsAsNarration" BOOLEAN,
    "countsAsInnerVoice" BOOLEAN,
    "readerVisible" BOOLEAN,
    "spokenAloud" BOOLEAN,
    "speakerMode" TEXT NOT NULL DEFAULT 'unknown',
    "fixedSpeakerId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "provenance" TEXT NOT NULL DEFAULT 'author',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SymbolUsageRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "magic_story"."SymbolOccurrenceOverride" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "usageRuleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "exactExcerpt" TEXT NOT NULL,
    "anchorBefore" TEXT NOT NULL,
    "anchorAfter" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "anchorFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SymbolOccurrenceOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectSymbolDefinition_projectId_openSymbol_closeSymbol_key" ON "magic_story"."ProjectSymbolDefinition"("projectId", "openSymbol", "closeSymbol");
CREATE INDEX "ProjectSymbolDefinition_projectId_order_idx" ON "magic_story"."ProjectSymbolDefinition"("projectId", "order");
CREATE INDEX "ProjectSymbolDefinition_defaultUsageRuleId_idx" ON "magic_story"."ProjectSymbolDefinition"("defaultUsageRuleId");
CREATE INDEX "SymbolUsageRule_projectId_definitionId_idx" ON "magic_story"."SymbolUsageRule"("projectId", "definitionId");
CREATE INDEX "SymbolUsageRule_fixedSpeakerId_idx" ON "magic_story"."SymbolUsageRule"("fixedSpeakerId");
CREATE INDEX "SymbolOccurrenceOverride_projectId_chapterId_idx" ON "magic_story"."SymbolOccurrenceOverride"("projectId", "chapterId");
CREATE INDEX "SymbolOccurrenceOverride_definitionId_idx" ON "magic_story"."SymbolOccurrenceOverride"("definitionId");
CREATE INDEX "SymbolOccurrenceOverride_usageRuleId_idx" ON "magic_story"."SymbolOccurrenceOverride"("usageRuleId");
CREATE UNIQUE INDEX "SymbolOccurrenceOverride_chapterId_startOffset_endOffset_key" ON "magic_story"."SymbolOccurrenceOverride"("chapterId", "startOffset", "endOffset");

ALTER TABLE "magic_story"."ProjectSymbolDefinition" ADD CONSTRAINT "ProjectSymbolDefinition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."SymbolUsageRule" ADD CONSTRAINT "SymbolUsageRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Deferred NO ACTION keeps direct referenced-row deletion restricted while
-- allowing a Project cascade to remove the complete cyclic dictionary graph.
ALTER TABLE "magic_story"."SymbolUsageRule" ADD CONSTRAINT "SymbolUsageRule_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "magic_story"."ProjectSymbolDefinition"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "magic_story"."SymbolUsageRule" ADD CONSTRAINT "SymbolUsageRule_fixedSpeakerId_fkey" FOREIGN KEY ("fixedSpeakerId") REFERENCES "magic_story"."Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "magic_story"."SymbolOccurrenceOverride" ADD CONSTRAINT "SymbolOccurrenceOverride_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."SymbolOccurrenceOverride" ADD CONSTRAINT "SymbolOccurrenceOverride_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."SymbolOccurrenceOverride" ADD CONSTRAINT "SymbolOccurrenceOverride_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "magic_story"."ProjectSymbolDefinition"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "magic_story"."SymbolOccurrenceOverride" ADD CONSTRAINT "SymbolOccurrenceOverride_usageRuleId_fkey" FOREIGN KEY ("usageRuleId") REFERENCES "magic_story"."SymbolUsageRule"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "magic_story"."ProjectSymbolDefinition" ADD CONSTRAINT "ProjectSymbolDefinition_defaultUsageRuleId_fkey" FOREIGN KEY ("defaultUsageRuleId") REFERENCES "magic_story"."SymbolUsageRule"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "magic_story"."SymbolUsageRule" ADD CONSTRAINT "SymbolUsageRule_semanticKind_check" CHECK ("semanticKind" IN ('dialogue', 'inner_voice', 'quotation', 'narrative_span', 'displayed_text', 'special_voice', 'custom'));
ALTER TABLE "magic_story"."SymbolUsageRule" ADD CONSTRAINT "SymbolUsageRule_speakerMode_check" CHECK ("speakerMode" IN ('none', 'fixed_character', 'current_pov', 'contextual', 'unknown'));
ALTER TABLE "magic_story"."SymbolUsageRule" ADD CONSTRAINT "SymbolUsageRule_provenance_check" CHECK ("provenance" IN ('author', 'imported', 'ai_suggested_then_confirmed'));
ALTER TABLE "magic_story"."SymbolUsageRule" ADD CONSTRAINT "SymbolUsageRule_fixedSpeaker_shape_check" CHECK (("speakerMode" = 'fixed_character' AND "fixedSpeakerId" IS NOT NULL) OR ("speakerMode" <> 'fixed_character' AND "fixedSpeakerId" IS NULL));
ALTER TABLE "magic_story"."SymbolOccurrenceOverride" ADD CONSTRAINT "SymbolOccurrenceOverride_status_check" CHECK ("status" = 'confirmed');
