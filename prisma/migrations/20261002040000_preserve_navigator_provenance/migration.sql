-- Navigator history is provenance. Prevent deleting an anchor/source while the
-- history still refers to it; Project deletion continues to cascade via Project FKs.
ALTER TABLE "magic_story"."StoryNavigatorRun" DROP CONSTRAINT "StoryNavigatorRun_anchorChapterId_fkey";
ALTER TABLE "magic_story"."StoryNavigatorExplorationRun" DROP CONSTRAINT "StoryNavigatorExplorationRun_anchorChapterId_fkey";
ALTER TABLE "magic_story"."StoryNavigatorObservation" DROP CONSTRAINT "StoryNavigatorObservation_sourceChapterId_fkey";
ALTER TABLE "magic_story"."StoryNavigatorPromotionAction" DROP CONSTRAINT "StoryNavigatorPromotionAction_sourceProposalId_fkey";
ALTER TABLE "magic_story"."StoryNavigatorPromotionAction" DROP CONSTRAINT "StoryNavigatorPromotionAction_sourceObservationId_fkey";

ALTER TABLE "magic_story"."StoryNavigatorRun" ADD CONSTRAINT "StoryNavigatorRun_anchorChapterId_fkey" FOREIGN KEY ("anchorChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorExplorationRun" ADD CONSTRAINT "StoryNavigatorExplorationRun_anchorChapterId_fkey" FOREIGN KEY ("anchorChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorObservation" ADD CONSTRAINT "StoryNavigatorObservation_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "magic_story"."Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorPromotionAction" ADD CONSTRAINT "StoryNavigatorPromotionAction_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "magic_story"."StoryNavigatorProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "magic_story"."StoryNavigatorPromotionAction" ADD CONSTRAINT "StoryNavigatorPromotionAction_sourceObservationId_fkey" FOREIGN KEY ("sourceObservationId") REFERENCES "magic_story"."StoryNavigatorObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
