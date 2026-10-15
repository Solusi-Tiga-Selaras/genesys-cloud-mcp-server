# Tool Roadmap

This roadmap turns the server into a practical Genesys Cloud support and
operations assistant without exposing the entire Platform API to an LLM.

## Principles

- Prefer evidence-returning, read-only tools.
- Add tools for repeatable company workflows, not one wrapper per endpoint.
- Keep credentials isolated per Genesys Cloud organization.
- Require explicit opt-in and human approval for every write capability.
- Preserve published tool names and input contracts.
- Reuse the existing tool factory, auth wrapper, error helpers, and tests.

## Plan

| Phase | Outcome | Tools | Status |
|---|---|---|---|
| [Phase 1](phase-1-operational-insights.md) | Support investigation, supervisor insights, reporting, and resource discovery | `get_conversation_journey`, `get_queue_health`, `get_queue_performance`, `get_queue_members`, `search_users`, `search_divisions` | In progress (4/6) |
| [Phase 2](phase-2-controlled-actions.md) | Cross-channel search and controlled queue membership changes | `search_conversations`, `manage_queue_members` | Planned |

No delivery dates are assigned. Each tool should be implemented and released
independently when its workflow has a real consumer.

## Existing Coverage

The current server already provides:

- Queue discovery, real-time health, volume queries, and representative
  conversation sampling.
- Voice conversation search, transcripts, sentiment, topics, and call quality.
- OAuth client inventory and usage.
- Guarded queue creation.

The planned tools fill missing operational context. Langflow remains
responsible for summarization, recommendations, ticket updates, scheduling,
and approval UX.

## Use-Case Coverage

| Use case | Tool chain |
|---|---|
| Support investigation | `search_voice_conversations` or planned `search_conversations` -> `get_conversation_journey` -> `voice_call_quality` -> `conversation_transcript` |
| Supervisor assistant | `get_queue_health` -> planned `get_queue_members` |
| Quality assurance | `sample_conversations_by_queue` -> `conversation_transcript` -> `conversation_topics` -> `conversation_sentiment` -> `voice_call_quality` |
| Queue reporting | Planned `get_queue_performance` plus `query_queue_volumes` |
| Queue provisioning | Planned `search_divisions` -> `search_queues` -> `create_queue` -> planned `search_users` -> planned `manage_queue_members` |
| OAuth security review | `oauth_clients` -> `oauth_client_usage` |
| Helpdesk enrichment | Conversation investigation tools provide Genesys evidence; Langflow connects and updates the ticket system |

## Definition of Done

A planned tool is complete when:

1. Inputs are validated with Zod and bounded to Genesys API limits.
2. Results are compact JSON suitable for another tool or an LLM.
3. Authorization, missing-permission, empty-result, and API errors are clear.
4. Unit tests cover the successful call and the important failure or safety path.
5. `npm run lint:check`, `npm test`, and `npm run build` pass.
6. `docs/tools.md` and the package version are updated before publishing.

## Deferred Until Requested

- Queue deletion or unrestricted queue updates.
- Generic `call_genesys_api` access.
- Agent presence or routing-status mutation.
- Architect flow creation or publication.
- Outbound campaign management.
- A server-side AI summarizer; the MCP client already owns that job.
