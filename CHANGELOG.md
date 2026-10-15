# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Named client connection profiles for Japan and Singapore, selected through
  `GENESYSCLOUD_PROFILES_FILE` and `GENESYSCLOUD_PROFILE` for stdio, or
  `/mcp/<profile>` for Streamable HTTP. Each profile has its own region and
  OAuth credentials; unknown profiles never fall back to another client.

### Fixed

- Isolate SDK clients, authentication state, and OAuth usage caches per
  connection profile instead of sharing them across the process. Concurrent
  tool calls for one profile share its initial authentication request.

### Security

- Exclude environment files, client profile credentials, and Git metadata from
  Docker build contexts.

## [0.2.0] - 2026-09-23

### Added

- `get_queue_performance` tool: historical queue performance for a time
  interval, including offered, answered, abandoned, and transferred counts,
  service level, average speed of answer (ASA), average handle time (AHT),
  talk, hold, and after-call work (ACW). Optional interval granularity returns
  per-bucket metrics. Requires `analytics:conversationAggregate:view`.
- `get_queue_members` tool: routing queue members with joined state,
  routing status, presence, skills, and languages. Requires
  `routing:queue:view`.
- `get_queue_health` tool: real-time queue snapshot with agent availability
  and waiting, interacting, and longest-wait metrics by media type.
- `get_conversation_journey` tool: participants, sessions, and chronologically
  ordered segments for one conversation, with derived transfer count and total
  queue wait.
- `search_genesys_cloud_docs` tool: searches public Genesys Cloud Developer
  Center and Resource Center documentation.
- `search_genesys_cloud_developer_forum` tool: searches Developer Community
  discussions through Firecrawl. Registered only when `FIRECRAWL_API_KEY` is
  set.
- Default MCP tool annotations that mark tools as read-only, non-destructive,
  and idempotent.
- Streamable HTTP transport via `npm run start:http`, with an `/mcp` endpoint
  and a `/health` endpoint.
- Docker Compose development setup.

### Security

- New write tooling stays opt-in. Queue creation remains disabled unless
  `GENESYSCLOUD_ENABLE_QUEUE_CREATION=true`.

## [0.1.0] - 2026-09-10

### Added

- Initial Solutif release of the Genesys Cloud MCP server.

[unreleased]: https://github.com/Solusi-Tiga-Selaras/genesys-cloud-mcp-server/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Solusi-Tiga-Selaras/genesys-cloud-mcp-server/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Solusi-Tiga-Selaras/genesys-cloud-mcp-server/releases/tag/v0.1.0
