CREATE TABLE "magic_story"."StoryArchitectureApplyAction" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "architectureId" TEXT NOT NULL,
  "sourceItemType" TEXT NOT NULL,
  "sourceItemId" TEXT NOT NULL,
  "sourceProposalRunId" TEXT,
  "targetType" TEXT NOT NULL DEFAULT 'plot',
  "operation" TEXT NOT NULL DEFAULT 'create',
  "proposedPayload" TEXT NOT NULL,
  "sourceSnapshot" TEXT NOT NULL,
  "targetSnapshot" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "targetFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "resultTargetId" TEXT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  CONSTRAINT "StoryArchitectureApplyAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoryArchitectureApplyAction_source_type_check" CHECK ("sourceItemType" IN ('thread', 'beat')),
  CONSTRAINT "StoryArchitectureApplyAction_target_type_check" CHECK ("targetType" = 'plot'),
  CONSTRAINT "StoryArchitectureApplyAction_operation_check" CHECK ("operation" = 'create'),
  CONSTRAINT "StoryArchitectureApplyAction_status_check" CHECK ("status" IN ('draft', 'approved', 'applying', 'applied', 'stale', 'failed', 'cancelled')),
  CONSTRAINT "StoryArchitectureApplyAction_result_check" CHECK (("status" = 'applied' AND "resultTargetId" IS NOT NULL AND "appliedAt" IS NOT NULL) OR ("status" <> 'applied' AND "resultTargetId" IS NULL))
);

CREATE INDEX "StoryArchitectureApplyAction_project_created_idx" ON "magic_story"."StoryArchitectureApplyAction"("projectId", "createdAt");
CREATE INDEX "StoryArchitectureApplyAction_source_idx" ON "magic_story"."StoryArchitectureApplyAction"("architectureId", "sourceItemType", "sourceItemId");
CREATE INDEX "StoryArchitectureApplyAction_sourceRun_idx" ON "magic_story"."StoryArchitectureApplyAction"("sourceProposalRunId");
CREATE INDEX "StoryArchitectureApplyAction_result_idx" ON "magic_story"."StoryArchitectureApplyAction"("resultTargetId");
-- At most one approved/in-flight/applied Plot creation may exist for one Architecture source item.
CREATE UNIQUE INDEX "StoryArchitectureApplyAction_active_source_unique" ON "magic_story"."StoryArchitectureApplyAction"("architectureId", "sourceItemType", "sourceItemId", "targetType", "operation") WHERE "status" IN ('approved', 'applying', 'applied');

ALTER TABLE "magic_story"."StoryArchitectureApplyAction" ADD CONSTRAINT "StoryArchitectureApplyAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureApplyAction" ADD CONSTRAINT "StoryArchitectureApplyAction_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "magic_story"."StoryArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureApplyAction" ADD CONSTRAINT "StoryArchitectureApplyAction_sourceProposalRunId_fkey" FOREIGN KEY ("sourceProposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureApplyAction" ADD CONSTRAINT "StoryArchitectureApplyAction_resultTargetId_fkey" FOREIGN KEY ("resultTargetId") REFERENCES "magic_story"."Plot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
