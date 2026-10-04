-- Only one active analysis may consume model work for the same semantic input.
-- Completed and failed rows remain unrestricted historical results.
CREATE UNIQUE INDEX "StoryMeaningAnalysisRun_pending_input_key"
ON "magic_story"."StoryMeaningAnalysisRun"(
  "projectId", "chapterId", "contentHash", "contextFingerprint", "fingerprintVersion", "promptVersion"
)
WHERE "status" = 'pending';
