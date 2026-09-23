# Solutif Genesys Cloud MCP Server

Solutif's MCP server for Genesys Cloud Platform API operations and analytics.

## Tools

| Tool | Description |
|---|---|
| [`search_genesys_cloud_docs`](docs/tools.md#search-genesys-cloud-docs) | Searches public Genesys Cloud developer and product documentation |
| [`search_genesys_cloud_developer_forum`](docs/tools.md#search-genesys-cloud-developer-forum) | Searches Developer Community discussions when Firecrawl is configured |
| [`create_queue`](docs/tools.md#create-queue) | Creates a queue after checking for a duplicate name |
| [`get_conversation_journey`](docs/tools.md#get-conversation-journey) | Retrieves a chronological conversation journey |
| [`search_queues`](docs/tools.md#search-queues) | Searches queues by name |
| [`get_queue_health`](docs/tools.md#get-queue-health) | Retrieves real-time queue and media health |
| [`query_queue_volumes`](docs/tools.md#query-queue-volumes) | Retrieves queue conversation volumes |
| [`sample_conversations_by_queue`](docs/tools.md#sample-conversations-by-queue) | Samples conversations from a queue |
| [`voice_call_quality`](docs/tools.md#voice-call-quality) | Retrieves voice quality metrics |
| [`conversation_sentiment`](docs/tools.md#conversation-sentiment) | Retrieves conversation sentiment |
| [`conversation_topics`](docs/tools.md#conversation-topics) | Retrieves conversation topics |
| [`search_voice_conversations`](docs/tools.md#search-voice-conversations) | Searches voice conversations |
| [`conversation_transcript`](docs/tools.md#conversation-transcript) | Retrieves a conversation transcript |
| [`oauth_clients`](docs/tools.md#oauth-clients) | Lists OAuth clients |
| [`oauth_client_usage`](docs/tools.md#oauth-client-usage) | Retrieves OAuth client usage |

## Local setup

```bash
npm install
npm run build
```

Configure your MCP client to run the local build:

```json
{
  "mcpServers": {
    "solutif-genesys-cloud": {
      "command": "node",
      "args": ["/absolute/path/to/genesys-cloud-mcp-server/dist/index.js"],
      "env": {
        "GENESYSCLOUD_REGION": "<REGION>",
        "GENESYSCLOUD_OAUTHCLIENT_ID": "<OAUTH_CLIENT_ID>",
        "GENESYSCLOUD_OAUTHCLIENT_SECRET": "<OAUTH_CLIENT_SECRET>"
      }
    }
  }
}
```

The server is read-only by default. To expose `create_queue`, add:

```json
"GENESYSCLOUD_ENABLE_QUEUE_CREATION": "true"
```

The OAuth client then needs `routing:queue:add` and `routing:queue:view`. Keep `create_queue` out of the MCP client's auto-approved tools so every write requires user approval.

To expose `search_genesys_cloud_developer_forum`, optionally add:

```json
"FIRECRAWL_API_KEY": "<FIRECRAWL_API_KEY>"
```

Forum search queries are sent to Firecrawl. Without this variable, the forum
search tool is not registered.

## Remote Streamable HTTP

The default transport remains `stdio`. To expose the same tools through a
stateless Streamable HTTP endpoint:

```bash
HOST=0.0.0.0 \
PORT=3000 \
MCP_ALLOWED_HOSTS=mcp.example.com \
GENESYSCLOUD_REGION=<REGION> \
GENESYSCLOUD_OAUTHCLIENT_ID=<OAUTH_CLIENT_ID> \
GENESYSCLOUD_OAUTHCLIENT_SECRET=<OAUTH_CLIENT_SECRET> \
npm run start:http
```

The MCP endpoint is `/mcp` and the health endpoint is `/health`. Terminate TLS
at a reverse proxy so clients connect through a valid HTTPS URL such as
`https://mcp.example.com/mcp`. `MCP_ALLOWED_HOSTS` accepts comma-separated host
names and is required when listening outside localhost.

The HTTP transport does not provide user authentication. Keep it private for
development or place it behind an MCP-compatible OAuth layer before exposing
company credentials on the public internet.

## MCP Bundle

```bash
npm run package:mcpb
```

Install the generated `genesys-cloud-mcp-server.mcpb` in Claude Desktop. Queue creation is disabled by default and can be enabled in the extension settings.

## Development

```bash
npm run lint:check
npm run build
npm test -- --run
```

## Roadmap

See the [tool roadmap](docs/plans/README.md) for the planned operational and
queue-management tools.

Based on the MIT-licensed [MakingChatbots Genesys Cloud MCP Server](https://github.com/MakingChatbots/genesys-cloud-mcp-server).
