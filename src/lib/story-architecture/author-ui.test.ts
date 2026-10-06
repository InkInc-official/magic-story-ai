import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync('src/lib/story-architecture/author-ui.ts', 'utf8');
const route = readFileSync('src/app/api/story-architecture/proposals/route.ts', 'utf8');

test('proposal API accepts only author request fields and validates scope', () => {
  assert.match(service, /\['projectId', 'architectureId', 'operation', 'scope', 'instruction', 'force'\]/);
  assert.match(service, /assertOnlyKeys\(input\.scope, \['type', 'id'\]\)/);
  assert.match(service, /STORY_ARCHITECT_OPERATIONS\.includes/);
  assert.match(service, /ARCHITECT_SCOPE_TYPES\.includes/);
});

test('public proposal DTO does not expose context or prompt internals', () => {
  const dto = service.slice(service.indexOf('export function publicStoryArchitectureProposalRun'), service.indexOf('const proposalInclude'));
  assert.doesNotMatch(dto, /contextFingerprint|sourceManifest|identityKey|promptVersion|contextVersion/);
  assert.match(dto, /alternatives/); assert.match(dto, /threads/); assert.match(dto, /beats/);
});

test('proposal history is ownership-bound and bounded to twenty runs', () => {
  assert.match(service, /findFirst\(\{ where: \{ id: architectureId, projectId \}/);
  assert.match(service, /take: 20/);
  assert.match(route, /listStoryArchitectureProposalRuns\(projectId, architectureId\)/);
});
