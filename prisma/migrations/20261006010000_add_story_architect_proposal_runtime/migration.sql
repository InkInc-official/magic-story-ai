ALTER TABLE "magic_story"."StoryArchitectureProposalRun"
  ADD COLUMN "operation" TEXT NOT NULL DEFAULT 'design_scope',
  ADD COLUMN "identityKey" TEXT,
  ADD COLUMN "summary" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "impactNotes" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "unresolvedQuestions" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "magic_story"."StoryArchitectureProposalAlternative" (
  "id" TEXT NOT NULL,
  "proposalRunId" TEXT NOT NULL,
  "alternativeKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "rationale" TEXT NOT NULL DEFAULT '',
  "tradeoffs" TEXT NOT NULL DEFAULT '[]',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryArchitectureProposalAlternative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "magic_story"."StoryArchitectureProposalSource" (
  "id" TEXT NOT NULL,
  "proposalRunId" TEXT NOT NULL,
  "proposalAlternativeId" TEXT NOT NULL,
  "itemType" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoryArchitectureProposalSource_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "magic_story"."StoryArchitectureThread" ADD COLUMN "proposalAlternativeId" TEXT;
ALTER TABLE "magic_story"."StoryArchitectureBeat" ADD COLUMN "proposalAlternativeId" TEXT;
ALTER TABLE "magic_story"."StoryArchitectureConstraint" ADD COLUMN "proposalAlternativeId" TEXT;
ALTER TABLE "magic_story"."StoryArchitectureQuestion" ADD COLUMN "proposalAlternativeId" TEXT;
ALTER TABLE "magic_story"."StoryArchitectureQuestion" ADD COLUMN "answerToQuestionId" TEXT, ADD COLUMN "resolutionCandidate" TEXT;
ALTER TABLE "magic_story"."StoryArchitectureBeatRelation" ADD COLUMN "proposalRunId" TEXT, ADD COLUMN "proposalAlternativeId" TEXT;

DROP INDEX "magic_story"."StoryArchitectureBeatRelation_architectureId_fromBeatId_toBeatId_type_key";
CREATE INDEX "StoryArchitectureBeatRelation_architecture_refs_idx" ON "magic_story"."StoryArchitectureBeatRelation"("architectureId", "fromBeatId", "toBeatId", "type");
CREATE UNIQUE INDEX "StoryArchitectureBeatRelation_author_unique" ON "magic_story"."StoryArchitectureBeatRelation"("architectureId", "fromBeatId", "toBeatId", "type") WHERE "proposalAlternativeId" IS NULL;
CREATE UNIQUE INDEX "StoryArchitectureBeatRelation_alternative_unique" ON "magic_story"."StoryArchitectureBeatRelation"("proposalAlternativeId", "fromBeatId", "toBeatId", "type") WHERE "proposalAlternativeId" IS NOT NULL;

CREATE UNIQUE INDEX "StoryArchitectureProposalAlternative_run_key_key" ON "magic_story"."StoryArchitectureProposalAlternative"("proposalRunId", "alternativeKey");
CREATE INDEX "StoryArchitectureProposalAlternative_run_order_idx" ON "magic_story"."StoryArchitectureProposalAlternative"("proposalRunId", "order");
CREATE UNIQUE INDEX "StoryArchitectureProposalSource_alt_item_source_key" ON "magic_story"."StoryArchitectureProposalSource"("proposalAlternativeId", "itemType", "itemId", "sourceType", "sourceId");
CREATE INDEX "StoryArchitectureProposalSource_run_idx" ON "magic_story"."StoryArchitectureProposalSource"("proposalRunId");
CREATE INDEX "StoryArchitectureProposalRun_identityKey_idx" ON "magic_story"."StoryArchitectureProposalRun"("identityKey");
-- PostgreSQL partial uniqueness prevents duplicate in-flight model calls while retaining completed/failed history.
CREATE UNIQUE INDEX "StoryArchitectureProposalRun_pending_identity_key" ON "magic_story"."StoryArchitectureProposalRun"("identityKey") WHERE "status" = 'pending' AND "identityKey" IS NOT NULL;
CREATE INDEX "StoryArchitectureThread_proposalAlternativeId_idx" ON "magic_story"."StoryArchitectureThread"("proposalAlternativeId");
CREATE INDEX "StoryArchitectureBeat_proposalAlternativeId_idx" ON "magic_story"."StoryArchitectureBeat"("proposalAlternativeId");
CREATE INDEX "StoryArchitectureConstraint_proposalAlternativeId_idx" ON "magic_story"."StoryArchitectureConstraint"("proposalAlternativeId");
CREATE INDEX "StoryArchitectureQuestion_proposalAlternativeId_idx" ON "magic_story"."StoryArchitectureQuestion"("proposalAlternativeId");
CREATE INDEX "StoryArchitectureQuestion_answerToQuestionId_idx" ON "magic_story"."StoryArchitectureQuestion"("answerToQuestionId");
CREATE INDEX "StoryArchitectureBeatRelation_proposalRunId_idx" ON "magic_story"."StoryArchitectureBeatRelation"("proposalRunId");
CREATE INDEX "StoryArchitectureBeatRelation_proposalAlternativeId_idx" ON "magic_story"."StoryArchitectureBeatRelation"("proposalAlternativeId");

ALTER TABLE "magic_story"."StoryArchitectureProposalAlternative" ADD CONSTRAINT "StoryArchitectureProposalAlternative_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureProposalSource" ADD CONSTRAINT "StoryArchitectureProposalSource_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureProposalSource" ADD CONSTRAINT "StoryArchitectureProposalSource_proposalAlternativeId_fkey" FOREIGN KEY ("proposalAlternativeId") REFERENCES "magic_story"."StoryArchitectureProposalAlternative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureThread" ADD CONSTRAINT "StoryArchitectureThread_proposalAlternativeId_fkey" FOREIGN KEY ("proposalAlternativeId") REFERENCES "magic_story"."StoryArchitectureProposalAlternative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeat" ADD CONSTRAINT "StoryArchitectureBeat_proposalAlternativeId_fkey" FOREIGN KEY ("proposalAlternativeId") REFERENCES "magic_story"."StoryArchitectureProposalAlternative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureConstraint" ADD CONSTRAINT "StoryArchitectureConstraint_proposalAlternativeId_fkey" FOREIGN KEY ("proposalAlternativeId") REFERENCES "magic_story"."StoryArchitectureProposalAlternative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureQuestion" ADD CONSTRAINT "StoryArchitectureQuestion_proposalAlternativeId_fkey" FOREIGN KEY ("proposalAlternativeId") REFERENCES "magic_story"."StoryArchitectureProposalAlternative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureQuestion" ADD CONSTRAINT "StoryArchitectureQuestion_answerToQuestionId_fkey" FOREIGN KEY ("answerToQuestionId") REFERENCES "magic_story"."StoryArchitectureQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeatRelation" ADD CONSTRAINT "StoryArchitectureBeatRelation_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeatRelation" ADD CONSTRAINT "StoryArchitectureBeatRelation_proposalAlternativeId_fkey" FOREIGN KEY ("proposalAlternativeId") REFERENCES "magic_story"."StoryArchitectureProposalAlternative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
