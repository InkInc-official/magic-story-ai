CREATE TABLE "magic_story"."StoryNavigatorPromotionAction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceProposalId" TEXT,
    "sourceObservationId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetExistingId" TEXT,
    "operation" TEXT NOT NULL DEFAULT 'create',
    "proposedPayload" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceSnapshot" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "targetSnapshot" TEXT NOT NULL DEFAULT '',
    "createdEntityId" TEXT,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    CONSTRAINT "StoryNavigatorPromotionAction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryNavigatorPromotionAction_source_check" CHECK (("sourceType" = 'navigator_proposal' AND "sourceProposalId" IS NOT NULL AND "sourceObservationId" IS NULL) OR ("sourceType" = 'navigator_observation' AND "sourceObservationId" IS NOT NULL AND "sourceProposalId" IS NULL)),
    CONSTRAINT "StoryNavigatorPromotionAction_target_check" CHECK ("targetType" IN ('plot', 'foreshadowing') AND "operation" = 'create')
);
CREATE INDEX "StoryNavigatorPromotionAction_projectId_status_idx" ON "magic_story"."StoryNavigatorPromotionAction"("projectId", "status");
CREATE INDEX "StoryNavigatorPromotionAction_sourceProposalId_idx" ON "magic_story"."StoryNavigatorPromotionAction"("sourceProposalId");
CREATE INDEX "StoryNavigatorPromotionAction_sourceObservationId_idx" ON "magic_story"."StoryNavigatorPromotionAction"("sourceObservationId");
CREATE INDEX "StoryNavigatorPromotionAction_createdEntityId_idx" ON "magic_story"."StoryNavigatorPromotionAction"("createdEntityId");
ALTER TABLE "magic_story"."StoryNavigatorPromotionAction" ADD CONSTRAINT "StoryNavigatorPromotionAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorPromotionAction" ADD CONSTRAINT "StoryNavigatorPromotionAction_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "magic_story"."StoryNavigatorProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorPromotionAction" ADD CONSTRAINT "StoryNavigatorPromotionAction_sourceObservationId_fkey" FOREIGN KEY ("sourceObservationId") REFERENCES "magic_story"."StoryNavigatorObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
