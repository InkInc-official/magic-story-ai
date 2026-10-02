-- Promotion actions have a closed lifecycle. Keep invalid direct SQL writes from
-- bypassing the application state machine.
ALTER TABLE "magic_story"."StoryNavigatorPromotionAction"
ADD CONSTRAINT "StoryNavigatorPromotionAction_status_check"
CHECK ("status" IN ('draft', 'approved', 'applying', 'applied', 'rejected', 'stale', 'failed'));
