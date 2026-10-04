CREATE TABLE "magic_story"."StoryMeaningAnalysisRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contextFingerprint" TEXT NOT NULL,
    "fingerprintVersion" TEXT NOT NULL DEFAULT 'meaning-v1',
    "promptVersion" TEXT NOT NULL,
    "sourceManifest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "StoryMeaningAnalysisRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryMeaningAnalysisRun_status_check" CHECK ("status" IN ('pending', 'completed', 'failed')),
    CONSTRAINT "StoryMeaningAnalysisRun_fingerprintVersion_check" CHECK ("fingerprintVersion" = 'meaning-v1'),
    CONSTRAINT "StoryMeaningAnalysisRun_error_length_check" CHECK (char_length("error") <= 4000)
);

CREATE TABLE "magic_story"."StoryMeaningEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "localEventKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "actorRefsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryMeaningEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryMeaningEvent_order_check" CHECK ("order" >= 0),
    CONSTRAINT "StoryMeaningEvent_summary_length_check" CHECK (char_length("summary") BETWEEN 1 AND 500)
);

CREATE TABLE "magic_story"."StoryMeaningClaim" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "localClaimKey" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "layer" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "supportLevel" TEXT NOT NULL,
    "impactScope" TEXT,
    "subtype" TEXT,
    "evidenceRefsJson" TEXT NOT NULL,
    "relatedEntityRefsJson" TEXT NOT NULL DEFAULT '[]',
    "provenance" TEXT NOT NULL DEFAULT 'ai_analysis',
    "claimFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryMeaningClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryMeaningClaim_order_check" CHECK ("order" >= 0),
    CONSTRAINT "StoryMeaningClaim_layer_check" CHECK ("layer" IN ('observed', 'derived', 'interpretive')),
    CONSTRAINT "StoryMeaningClaim_dimension_check" CHECK ("dimension" IN ('external_tension', 'emotional_intensity', 'narrative_significance', 'state_change', 'turning_point', 'truth_revelation', 'relationship_change', 'decision_commitment', 'resolution', 'aftermath', 'reader_knowledge_change', 'character_knowledge_change', 'thematic_significance', 'character_trajectory', 'other')),
    CONSTRAINT "StoryMeaningClaim_supportLevel_check" CHECK ("supportLevel" IN ('explicit_text', 'strongly_supported', 'plausible_interpretation', 'uncertain')),
    CONSTRAINT "StoryMeaningClaim_impactScope_check" CHECK ("impactScope" IS NULL OR "impactScope" IN ('local', 'chapter', 'multi_chapter', 'whole_work', 'unknown')),
    CONSTRAINT "StoryMeaningClaim_provenance_check" CHECK ("provenance" IN ('ai_analysis', 'author_confirmed', 'author_edited', 'author_added')),
    CONSTRAINT "StoryMeaningClaim_statement_length_check" CHECK (char_length("statement") BETWEEN 1 AND 1000)
);

CREATE TABLE "magic_story"."StoryMeaningDecision" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "claimFingerprint" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "authorInterpretation" TEXT NOT NULL DEFAULT '',
    "decidedAgainstContentHash" TEXT NOT NULL,
    "decidedAgainstContextFingerprint" TEXT NOT NULL,
    "fingerprintVersion" TEXT NOT NULL DEFAULT 'meaning-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryMeaningDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryMeaningDecision_decision_check" CHECK ("decision" IN ('adopted', 'alternative', 'held', 'not_applicable')),
    CONSTRAINT "StoryMeaningDecision_fingerprintVersion_check" CHECK ("fingerprintVersion" = 'meaning-v1'),
    CONSTRAINT "StoryMeaningDecision_authorInterpretation_length_check" CHECK (char_length("authorInterpretation") <= 4000)
);

CREATE INDEX "StoryMeaningAnalysisRun_projectId_chapterId_createdAt_id_idx" ON "magic_story"."StoryMeaningAnalysisRun"("projectId", "chapterId", "createdAt", "id");
CREATE INDEX "StoryMeaningAnalysisRun_chapterId_status_idx" ON "magic_story"."StoryMeaningAnalysisRun"("chapterId", "status");
CREATE UNIQUE INDEX "StoryMeaningEvent_runId_localEventKey_key" ON "magic_story"."StoryMeaningEvent"("runId", "localEventKey");
CREATE INDEX "StoryMeaningEvent_runId_order_idx" ON "magic_story"."StoryMeaningEvent"("runId", "order");
CREATE UNIQUE INDEX "StoryMeaningClaim_eventId_localClaimKey_key" ON "magic_story"."StoryMeaningClaim"("eventId", "localClaimKey");
CREATE INDEX "StoryMeaningClaim_claimFingerprint_idx" ON "magic_story"."StoryMeaningClaim"("claimFingerprint");
CREATE INDEX "StoryMeaningClaim_eventId_order_idx" ON "magic_story"."StoryMeaningClaim"("eventId", "order");
CREATE INDEX "StoryMeaningDecision_claimId_createdAt_id_idx" ON "magic_story"."StoryMeaningDecision"("claimId", "createdAt", "id");
CREATE INDEX "StoryMeaningDecision_claimFingerprint_idx" ON "magic_story"."StoryMeaningDecision"("claimFingerprint");

ALTER TABLE "magic_story"."StoryMeaningAnalysisRun" ADD CONSTRAINT "StoryMeaningAnalysisRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryMeaningAnalysisRun" ADD CONSTRAINT "StoryMeaningAnalysisRun_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryMeaningEvent" ADD CONSTRAINT "StoryMeaningEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "magic_story"."StoryMeaningAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryMeaningClaim" ADD CONSTRAINT "StoryMeaningClaim_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "magic_story"."StoryMeaningEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryMeaningDecision" ADD CONSTRAINT "StoryMeaningDecision_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "magic_story"."StoryMeaningClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
