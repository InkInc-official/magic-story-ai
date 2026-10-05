-- CreateTable
CREATE TABLE "magic_story"."StoryArchitecture" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "frameworkMode" TEXT NOT NULL DEFAULT 'freeform',
    "customFrameworkNotes" TEXT NOT NULL DEFAULT '',
    "canonMode" TEXT NOT NULL DEFAULT 'respect_current_canon',
    "notes" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoryArchitecture_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryArchitecture_framework_check" CHECK (
      ("frameworkMode" = 'freeform' AND "customFrameworkNotes" = '') OR
      ("frameworkMode" = 'custom' AND length(btrim("customFrameworkNotes")) > 0)
    ),
    CONSTRAINT "StoryArchitecture_canon_check" CHECK ("canonMode" IN ('respect_current_canon', 'revise_canon')),
    CONSTRAINT "StoryArchitecture_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "StoryArchitecture_length_check" CHECK (length("title") BETWEEN 1 AND 200 AND length("customFrameworkNotes") <= 4000 AND length("notes") <= 4000)
);

-- CreateTable
CREATE TABLE "magic_story"."StoryArchitectureProposalRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "architectureId" TEXT NOT NULL,
    "scopeType" TEXT,
    "scopeId" TEXT,
    "request" TEXT NOT NULL DEFAULT '',
    "canonMode" TEXT NOT NULL,
    "contextVersion" TEXT,
    "promptVersion" TEXT,
    "contextFingerprint" TEXT,
    "sourceManifest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "StoryArchitectureProposalRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryArchitectureProposalRun_canon_check" CHECK ("canonMode" IN ('respect_current_canon', 'revise_canon')),
    CONSTRAINT "StoryArchitectureProposalRun_status_check" CHECK ("status" IN ('pending', 'completed', 'failed'))
);

-- CreateTable
CREATE TABLE "magic_story"."StoryArchitectureThread" (
    "id" TEXT NOT NULL, "architectureId" TEXT NOT NULL, "proposalRunId" TEXT,
    "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "threadType" TEXT NOT NULL,
    "customTypeLabel" TEXT, "status" TEXT NOT NULL DEFAULT 'draft', "provenance" TEXT NOT NULL DEFAULT 'author',
    "order" INTEGER NOT NULL DEFAULT 0, "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoryArchitectureThread_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryArchitectureThread_type_check" CHECK (
      ("threadType" = 'custom' AND "customTypeLabel" IS NOT NULL AND length(btrim("customTypeLabel")) BETWEEN 1 AND 120) OR
      ("threadType" IN ('character','relationship','mystery','conflict','theme','world','information','goal') AND "customTypeLabel" IS NULL)
    ),
    CONSTRAINT "StoryArchitectureThread_state_check" CHECK ("status" IN ('draft','proposed','approved','retired') AND "provenance" IN ('author','ai_proposal','imported')),
    CONSTRAINT "StoryArchitectureThread_source_check" CHECK (("provenance" = 'ai_proposal' AND "proposalRunId" IS NOT NULL) OR ("provenance" <> 'ai_proposal' AND "proposalRunId" IS NULL)),
    CONSTRAINT "StoryArchitectureThread_value_check" CHECK (length("title") BETWEEN 1 AND 200 AND length("description") <= 4000 AND "order" >= 0 AND "revision" >= 1)
);

-- CreateTable
CREATE TABLE "magic_story"."StoryArchitectureBeat" (
    "id" TEXT NOT NULL, "architectureId" TEXT NOT NULL, "proposalRunId" TEXT, "threadId" TEXT, "chapterId" TEXT,
    "title" TEXT NOT NULL, "summary" TEXT NOT NULL DEFAULT '', "intention" TEXT NOT NULL DEFAULT '',
    "storyOrder" INTEGER, "presentationOrder" INTEGER, "rhythm" TEXT, "customRhythmLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft', "provenance" TEXT NOT NULL DEFAULT 'author', "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoryArchitectureBeat_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryArchitectureBeat_rhythm_check" CHECK (
      ("rhythm" IS NULL AND "customRhythmLabel" IS NULL) OR
      ("rhythm" = 'custom' AND "customRhythmLabel" IS NOT NULL AND length(btrim("customRhythmLabel")) BETWEEN 1 AND 120) OR
      ("rhythm" IN ('build','release','quiet','aftermath','uncertainty','transition') AND "customRhythmLabel" IS NULL)
    ),
    CONSTRAINT "StoryArchitectureBeat_state_check" CHECK ("status" IN ('draft','proposed','approved','retired') AND "provenance" IN ('author','ai_proposal','imported')),
    CONSTRAINT "StoryArchitectureBeat_source_check" CHECK (("provenance" = 'ai_proposal' AND "proposalRunId" IS NOT NULL) OR ("provenance" <> 'ai_proposal' AND "proposalRunId" IS NULL)),
    CONSTRAINT "StoryArchitectureBeat_value_check" CHECK (length("title") BETWEEN 1 AND 200 AND length("summary") <= 4000 AND length("intention") <= 4000 AND ("storyOrder" IS NULL OR "storyOrder" >= 0) AND ("presentationOrder" IS NULL OR "presentationOrder" >= 0) AND "revision" >= 1)
);

-- CreateTable
CREATE TABLE "magic_story"."StoryArchitectureConstraint" (
    "id" TEXT NOT NULL, "architectureId" TEXT NOT NULL, "proposalRunId" TEXT,
    "title" TEXT NOT NULL, "statement" TEXT NOT NULL, "mode" TEXT NOT NULL, "scope" TEXT NOT NULL,
    "threadId" TEXT, "beatId" TEXT, "status" TEXT NOT NULL DEFAULT 'draft', "provenance" TEXT NOT NULL DEFAULT 'author',
    "order" INTEGER NOT NULL DEFAULT 0, "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoryArchitectureConstraint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryArchitectureConstraint_mode_check" CHECK ("mode" IN ('required','forbidden','preferred')),
    CONSTRAINT "StoryArchitectureConstraint_scope_check" CHECK (("scope"='architecture' AND "threadId" IS NULL AND "beatId" IS NULL) OR ("scope"='thread' AND "threadId" IS NOT NULL AND "beatId" IS NULL) OR ("scope"='beat' AND "threadId" IS NULL AND "beatId" IS NOT NULL)),
    CONSTRAINT "StoryArchitectureConstraint_state_check" CHECK ("status" IN ('draft','proposed','approved','retired') AND "provenance" IN ('author','ai_proposal','imported')),
    CONSTRAINT "StoryArchitectureConstraint_source_check" CHECK (("provenance" = 'ai_proposal' AND "proposalRunId" IS NOT NULL) OR ("provenance" <> 'ai_proposal' AND "proposalRunId" IS NULL)),
    CONSTRAINT "StoryArchitectureConstraint_value_check" CHECK (length("title") BETWEEN 1 AND 200 AND length(btrim("statement")) BETWEEN 1 AND 4000 AND "order" >= 0 AND "revision" >= 1)
);

-- CreateTable
CREATE TABLE "magic_story"."StoryArchitectureQuestion" (
    "id" TEXT NOT NULL, "architectureId" TEXT NOT NULL, "proposalRunId" TEXT,
    "question" TEXT NOT NULL, "notes" TEXT NOT NULL DEFAULT '', "state" TEXT NOT NULL DEFAULT 'open', "resolution" TEXT,
    "scope" TEXT NOT NULL, "threadId" TEXT, "beatId" TEXT, "status" TEXT NOT NULL DEFAULT 'draft',
    "provenance" TEXT NOT NULL DEFAULT 'author', "order" INTEGER NOT NULL DEFAULT 0, "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoryArchitectureQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryArchitectureQuestion_resolution_check" CHECK (("state"='resolved' AND "resolution" IS NOT NULL AND length(btrim("resolution")) BETWEEN 1 AND 4000) OR ("state" IN ('open','deferred') AND "resolution" IS NULL)),
    CONSTRAINT "StoryArchitectureQuestion_scope_check" CHECK (("scope"='architecture' AND "threadId" IS NULL AND "beatId" IS NULL) OR ("scope"='thread' AND "threadId" IS NOT NULL AND "beatId" IS NULL) OR ("scope"='beat' AND "threadId" IS NULL AND "beatId" IS NOT NULL)),
    CONSTRAINT "StoryArchitectureQuestion_state_check" CHECK ("status" IN ('draft','proposed','approved','retired') AND "provenance" IN ('author','ai_proposal','imported')),
    CONSTRAINT "StoryArchitectureQuestion_source_check" CHECK (("provenance" = 'ai_proposal' AND "proposalRunId" IS NOT NULL) OR ("provenance" <> 'ai_proposal' AND "proposalRunId" IS NULL)),
    CONSTRAINT "StoryArchitectureQuestion_value_check" CHECK (length(btrim("question")) BETWEEN 1 AND 2000 AND length("notes") <= 4000 AND "order" >= 0 AND "revision" >= 1)
);

-- CreateTable
CREATE TABLE "magic_story"."StoryArchitectureBeatRelation" (
    "id" TEXT NOT NULL, "architectureId" TEXT NOT NULL, "fromBeatId" TEXT NOT NULL, "toBeatId" TEXT NOT NULL,
    "type" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryArchitectureBeatRelation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryArchitectureBeatRelation_type_check" CHECK ("type" IN ('precedes','depends_on','causes','enables')),
    CONSTRAINT "StoryArchitectureBeatRelation_self_check" CHECK ("fromBeatId" <> "toBeatId")
);

-- CreateTable
CREATE TABLE "magic_story"."StoryArchitectureDecision" (
    "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "architectureId" TEXT NOT NULL, "proposalRunId" TEXT,
    "itemType" TEXT NOT NULL, "itemId" TEXT NOT NULL, "decision" TEXT NOT NULL, "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryArchitectureDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryArchitectureDecision_type_check" CHECK ("itemType" IN ('thread','beat','constraint','question')),
    CONSTRAINT "StoryArchitectureDecision_value_check" CHECK ("decision" IN ('approved','rejected','held')),
    CONSTRAINT "StoryArchitectureDecision_note_check" CHECK (length("note") <= 4000)
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryArchitecture_projectId_key" ON "magic_story"."StoryArchitecture"("projectId");
CREATE INDEX "StoryArchitectureProposalRun_architectureId_createdAt_idx" ON "magic_story"."StoryArchitectureProposalRun"("architectureId", "createdAt");
CREATE INDEX "StoryArchitectureProposalRun_projectId_idx" ON "magic_story"."StoryArchitectureProposalRun"("projectId");
CREATE INDEX "StoryArchitectureThread_architectureId_order_idx" ON "magic_story"."StoryArchitectureThread"("architectureId", "order");
CREATE INDEX "StoryArchitectureThread_proposalRunId_idx" ON "magic_story"."StoryArchitectureThread"("proposalRunId");
CREATE INDEX "StoryArchitectureBeat_architectureId_storyOrder_idx" ON "magic_story"."StoryArchitectureBeat"("architectureId", "storyOrder");
CREATE INDEX "StoryArchitectureBeat_architectureId_presentationOrder_idx" ON "magic_story"."StoryArchitectureBeat"("architectureId", "presentationOrder");
CREATE INDEX "StoryArchitectureBeat_proposalRunId_idx" ON "magic_story"."StoryArchitectureBeat"("proposalRunId");
CREATE INDEX "StoryArchitectureBeat_threadId_idx" ON "magic_story"."StoryArchitectureBeat"("threadId");
CREATE INDEX "StoryArchitectureBeat_chapterId_idx" ON "magic_story"."StoryArchitectureBeat"("chapterId");
CREATE INDEX "StoryArchitectureConstraint_architectureId_order_idx" ON "magic_story"."StoryArchitectureConstraint"("architectureId", "order");
CREATE INDEX "StoryArchitectureConstraint_proposalRunId_idx" ON "magic_story"."StoryArchitectureConstraint"("proposalRunId");
CREATE INDEX "StoryArchitectureConstraint_threadId_idx" ON "magic_story"."StoryArchitectureConstraint"("threadId");
CREATE INDEX "StoryArchitectureConstraint_beatId_idx" ON "magic_story"."StoryArchitectureConstraint"("beatId");
CREATE INDEX "StoryArchitectureQuestion_architectureId_order_idx" ON "magic_story"."StoryArchitectureQuestion"("architectureId", "order");
CREATE INDEX "StoryArchitectureQuestion_proposalRunId_idx" ON "magic_story"."StoryArchitectureQuestion"("proposalRunId");
CREATE INDEX "StoryArchitectureQuestion_threadId_idx" ON "magic_story"."StoryArchitectureQuestion"("threadId");
CREATE INDEX "StoryArchitectureQuestion_beatId_idx" ON "magic_story"."StoryArchitectureQuestion"("beatId");
CREATE UNIQUE INDEX "StoryArchitectureBeatRelation_architectureId_fromBeatId_toBeatId_type_key" ON "magic_story"."StoryArchitectureBeatRelation"("architectureId", "fromBeatId", "toBeatId", "type");
CREATE INDEX "StoryArchitectureBeatRelation_architectureId_idx" ON "magic_story"."StoryArchitectureBeatRelation"("architectureId");
CREATE INDEX "StoryArchitectureBeatRelation_fromBeatId_idx" ON "magic_story"."StoryArchitectureBeatRelation"("fromBeatId");
CREATE INDEX "StoryArchitectureBeatRelation_toBeatId_idx" ON "magic_story"."StoryArchitectureBeatRelation"("toBeatId");
CREATE INDEX "StoryArchitectureDecision_architectureId_itemType_itemId_createdAt_id_idx" ON "magic_story"."StoryArchitectureDecision"("architectureId", "itemType", "itemId", "createdAt", "id");
CREATE INDEX "StoryArchitectureDecision_projectId_idx" ON "magic_story"."StoryArchitectureDecision"("projectId");
CREATE INDEX "StoryArchitectureDecision_proposalRunId_idx" ON "magic_story"."StoryArchitectureDecision"("proposalRunId");

-- AddForeignKey
ALTER TABLE "magic_story"."StoryArchitecture" ADD CONSTRAINT "StoryArchitecture_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureProposalRun" ADD CONSTRAINT "StoryArchitectureProposalRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureProposalRun" ADD CONSTRAINT "StoryArchitectureProposalRun_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "magic_story"."StoryArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureThread" ADD CONSTRAINT "StoryArchitectureThread_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "magic_story"."StoryArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureThread" ADD CONSTRAINT "StoryArchitectureThread_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeat" ADD CONSTRAINT "StoryArchitectureBeat_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "magic_story"."StoryArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeat" ADD CONSTRAINT "StoryArchitectureBeat_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeat" ADD CONSTRAINT "StoryArchitectureBeat_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "magic_story"."StoryArchitectureThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeat" ADD CONSTRAINT "StoryArchitectureBeat_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureConstraint" ADD CONSTRAINT "StoryArchitectureConstraint_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "magic_story"."StoryArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureConstraint" ADD CONSTRAINT "StoryArchitectureConstraint_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureConstraint" ADD CONSTRAINT "StoryArchitectureConstraint_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "magic_story"."StoryArchitectureThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureConstraint" ADD CONSTRAINT "StoryArchitectureConstraint_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "magic_story"."StoryArchitectureBeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureQuestion" ADD CONSTRAINT "StoryArchitectureQuestion_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "magic_story"."StoryArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureQuestion" ADD CONSTRAINT "StoryArchitectureQuestion_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureQuestion" ADD CONSTRAINT "StoryArchitectureQuestion_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "magic_story"."StoryArchitectureThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureQuestion" ADD CONSTRAINT "StoryArchitectureQuestion_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "magic_story"."StoryArchitectureBeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeatRelation" ADD CONSTRAINT "StoryArchitectureBeatRelation_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "magic_story"."StoryArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeatRelation" ADD CONSTRAINT "StoryArchitectureBeatRelation_fromBeatId_fkey" FOREIGN KEY ("fromBeatId") REFERENCES "magic_story"."StoryArchitectureBeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureBeatRelation" ADD CONSTRAINT "StoryArchitectureBeatRelation_toBeatId_fkey" FOREIGN KEY ("toBeatId") REFERENCES "magic_story"."StoryArchitectureBeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureDecision" ADD CONSTRAINT "StoryArchitectureDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "magic_story"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureDecision" ADD CONSTRAINT "StoryArchitectureDecision_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "magic_story"."StoryArchitecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryArchitectureDecision" ADD CONSTRAINT "StoryArchitectureDecision_proposalRunId_fkey" FOREIGN KEY ("proposalRunId") REFERENCES "magic_story"."StoryArchitectureProposalRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
