# Phase 1: Operational Insights

## Goal

Cover the read-only data needed for support investigation, supervisor queries,
queue reporting, and safe resource discovery.

## Implementation Order

### 1. `get_conversation_journey`

Status: Implemented.

Answers why an interaction was queued, transferred, or disconnected. This is
the missing link between conversation search and the existing transcript,
sentiment, topic, and call-quality tools.

**Inputs**

- `conversationId` (required UUID)

**Result**

- Conversation start/end time and media types.
- Participants with purpose, user, queue, and external address when available.
- Ordered sessions and segments with segment type, queue, agent, wrap-up, and
  disconnect type.
- Derived transfer count and total queue wait.

**Genesys API**

- Conversation detail endpoint through `AnalyticsApi`.
- Expected permission: `analytics:conversationDetail:view`.

**Acceptance criteria**

- Segments are returned chronologically.
- Missing optional participant data does not fail the whole response.
- The tool derives only deterministic facts; narrative diagnosis stays in
  Langflow.

### 2. `get_queue_health`

Answers which queues currently need attention.

**Inputs**

- `queueIds` (required, non-empty UUID list)
- Optional media types

**Result**

- Waiting, interacting, and available routing counts by queue and media type.
- Longest current wait when returned by Genesys.
- Observation timestamp so callers know how fresh the result is.

**Genesys API**

- `AnalyticsApi.postAnalyticsQueuesObservationsQuery`.
- Expected permission: `analytics:queueObservation:view`.

**Acceptance criteria**

- Multiple queues are supported in one request within the API limit.
- Missing metrics are returned as unavailable, not silently converted to zero.
- The tool is annotated read-only and idempotent.

### 3. `get_queue_performance`

Answers how queues performed during a historical interval. It complements
`query_queue_volumes`, which only counts conversations.

**Inputs**

- `queueIds` (required, non-empty UUID list)
- `startDate` and `endDate` (required ISO-8601 timestamps)
- Optional `granularity`

**Result**

- Offered, answered, abandoned, and transferred counts.
- Service level, ASA, AHT, talk, hold, and ACW when available.
- Queue totals and optional interval buckets.

**Genesys API**

- `AnalyticsApi.postAnalyticsConversationsAggregatesQuery`.
- Expected permission: `analytics:conversationAggregate:view`.

**Acceptance criteria**

- Invalid or reversed intervals are rejected before the API call.
- Metric formulas and units are documented in `docs/tools.md`.
- Empty queues and zero-valued metrics remain distinguishable.

### 4. `get_queue_members`

Answers who belongs to a queue and whether they are currently able to receive
interactions.

**Inputs**

- `queueId` (required UUID)
- Optional `name`, `joined`, `presence`, and `routingStatus` filters
- Optional pagination

**Result**

- User ID, name, joined state, presence, routing status, skills, and languages
  when returned by Genesys.
- Pagination metadata.

**Genesys API**

- `RoutingApi.getRoutingQueueMembers`.
- Expected permission: `routing:queue:view`.

**Acceptance criteria**

- Filters map directly to supported API filters.
- The output does not imply availability from presence alone; joined and
  routing status remain separate fields.

### 5. `search_users`

Resolves a human name or email to a Genesys user ID before queue management.

**Inputs**

- Optional `name` or `email`
- Optional active/inactive state
- Optional pagination

**Result**

- User ID, name, email, state, title, and division when available.
- Pagination metadata.

**Genesys API**

- `UsersApi.postUsersSearch`; avoid preview search variants.
- Expected permission: `directory:user:view`.

**Acceptance criteria**

- At least one search criterion is required.
- Exact and partial matches are clearly identified.
- Sensitive profile fields not needed for identity resolution are omitted.

### 6. `search_divisions`

Resolves a division name to an ID for safe queue creation and later
provisioning workflows.

**Inputs**

- `name` (required)
- Optional pagination

**Result**

- Division ID, name, description, and home-division flag when available.
- Pagination metadata.

**Genesys API**

- `AuthorizationApi.getAuthorizationDivisions`.
- Expected permission: `authorization:division:view`.

**Acceptance criteria**

- Matching is case-insensitive and does not guess when several divisions match.
- Results expose IDs for use by `create_queue` without changing that tool's
  published input contract.

## Release Gate

- Confirm endpoint limits and permission names in the Genesys API Explorer
  during implementation.
- Test manually against a non-production Genesys Cloud organization.
- Publish the completed read-only set as the next minor release; partial tools
  may ship earlier as patch releases when independently useful.
