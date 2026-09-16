# Phase 2: Search Expansion and Controlled Actions

## Goal

Extend investigation beyond voice and allow explicitly authorized queue
membership changes. This phase starts only after Phase 1 has real usage.

## `search_conversations`

Generalizes conversation discovery across voice, chat, message, email, and
callback without removing the published `search_voice_conversations` tool.

**Inputs**

- `startDate` and `endDate` (required ISO-8601 timestamps)
- Optional phone/address, queue IDs, user IDs, media types, direction, and
  pagination

**Result**

- Conversation ID, timing, media type, direction, queues, users, external
  addresses, and disconnect outcome when available.
- Pagination metadata.

**Genesys API**

- `AnalyticsApi.postAnalyticsConversationsDetailsQuery`.
- Expected permission: `analytics:conversationDetail:view`.

**Acceptance criteria**

- Date intervals and page sizes are bounded before the API call.
- Phone and digital addresses are treated as optional search filters, not
  customer identity proof.
- Existing voice-search behavior remains backward compatible.
- Query-building code is shared only where it removes real duplication.

## `manage_queue_members`

Bulk-adds or removes queue members. It never deletes a queue or changes a
user's presence or routing status.

**Inputs**

- `queueId` (required UUID)
- `addUserIds` (optional UUID list)
- `removeUserIds` (optional UUID list)

At least one add or remove operation is required. The same user cannot appear
in both lists.

**Result**

- IDs added and removed.
- IDs skipped because they were already in the requested state.
- Explicit partial-failure details if one Genesys request succeeds and another
  fails.

**Genesys API**

- `RoutingApi.getRoutingQueueMembers` for the current state.
- `RoutingApi.postRoutingQueueMembers` for supported bulk changes.
- Expected permissions: `routing:queue:view`, `routing:queue:join`, and the
  applicable queue-member management permission confirmed in API Explorer.

**Safety requirements**

- Register only when `GENESYSCLOUD_ENABLE_QUEUE_MANAGEMENT=true`.
- Mark as destructive because removal is possible.
- Keep it out of MCP client auto-approval lists.
- Calculate deltas first so retries are idempotent.
- Respect the endpoint bulk limit and reject oversized input.
- Never log OAuth credentials or full user profile data.

**Acceptance criteria**

- No API mutation occurs when every requested member is already in the desired
  state.
- Adding and removing are tested separately.
- Mixed-operation partial failure is returned accurately; the tool does not
  claim transaction semantics Genesys does not provide.
- The feature flag and permissions are documented in `README.md` and
  `docs/tools.md` before release.

## Not Included

- Queue deletion.
- Agent status mutation.
- Arbitrary queue configuration updates.
- Automatic action without MCP client approval.
- Multi-organization credential switching inside one server process.
