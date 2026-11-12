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
| [`get_queue_performance`](docs/tools.md#get-queue-performance) | Retrieves historical queue performance metrics |
| [`get_queue_members`](docs/tools.md#get-queue-members) | Lists queue members with presence and routing status |
| [`query_queue_volumes`](docs/tools.md#query-queue-volumes) | Retrieves queue conversation volumes |
| [`sample_conversations_by_queue`](docs/tools.md#sample-conversations-by-queue) | Samples conversations from a queue |
| [`voice_call_quality`](docs/tools.md#voice-call-quality) | Retrieves voice quality metrics |
| [`conversation_sentiment`](docs/tools.md#conversation-sentiment) | Retrieves conversation sentiment |
| [`conversation_topics`](docs/tools.md#conversation-topics) | Retrieves conversation topics |
| [`search_voice_conversations`](docs/tools.md#search-voice-conversations) | Searches voice conversations |
| [`search_conversations_by_contact_id`](docs/tools.md#search-conversations-by-contact-id) | Finds conversation and participant IDs by external contact ID |
| [`conversation_transcript`](docs/tools.md#conversation-transcript) | Retrieves a conversation transcript |
| [`oauth_clients`](docs/tools.md#oauth-clients) | Lists OAuth clients |
| [Messenger configuration and deployment tools](docs/tools.md#messenger-configurations-and-deployments) | Inspect and manage Messenger configurations and deployments |
| [`oauth_client_usage`](docs/tools.md#oauth-client-usage) | Retrieves OAuth client usage |
| [Architect flow tools](docs/tools.md#architect-flows) | Inspect flows and publish YAML through Genesys Cloud flow jobs |

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

Messenger configuration and deployment reads are available by default. To
enable their write tools, set `GENESYSCLOUD_ENABLE_MESSENGER_WRITES=true`.
Publishing a configuration is a separate operation; a deployment can be
activated independently. Do not auto-approve write tools in the MCP client:
annotations are advisory, not server-side human approval. See the
[Messenger tool guide](docs/tools.md#messenger-configurations-and-deployments)
for permissions, workflow, and update risks.

Architect flow reads are available by default. Set
`GENESYSCLOUD_ENABLE_ARCHITECT_WRITES=true` to enable explicit YAML
publication. The cloud job creates or updates and publishes the flow; it does
not save an unpublished draft. Keep the YAML locally for review and do not
auto-approve this tool. Archy does not need to run in the Docker container.

To expose `search_genesys_cloud_developer_forum`, optionally add:

```json
"FIRECRAWL_API_KEY": "<FIRECRAWL_API_KEY>"
```

Forum search queries are sent to Firecrawl. Without this variable, the forum
search tool is not registered.

## Multiple clients (JP / SG)

Store client credentials in a private `genesys-profiles.local.json` file:

```json
{
  "client-a-jp": {
    "region": "jp",
    "oAuthClientId": "<CLIENT_A_OAUTH_ID>",
    "oAuthClientSecret": "<CLIENT_A_OAUTH_SECRET>"
  },
  "client-b-sg": {
    "region": "sg",
    "oAuthClientId": "<CLIENT_B_OAUTH_ID>",
    "oAuthClientSecret": "<CLIENT_B_OAUTH_SECRET>"
  }
}
```

Each profile represents one client organization. Multiple clients can share
the same region. `jp` resolves to `mypurecloud.jp`; `sg` resolves to
`apse1.pure.cloud`. Those two full domains are also accepted. Profile names
must start with a lowercase letter or digit and contain only lowercase
letters, digits, underscores, or hyphens.

Use an absolute file path, restrict access with `chmod 600`, and do not commit
credentials. The filename above is excluded by `.gitignore`.

### Named stdio connections

Add one connection per client to your MCP application's configuration:

```json
{
  "mcpServers": {
    "genesys-client-a-jp": {
      "command": "node",
      "args": ["/absolute/path/to/genesys-cloud-mcp-server/dist/index.js"],
      "env": {
        "GENESYSCLOUD_PROFILES_FILE": "/absolute/path/genesys-profiles.local.json",
        "GENESYSCLOUD_PROFILE": "client-a-jp"
      }
    },
    "genesys-client-b-sg": {
      "command": "node",
      "args": ["/absolute/path/to/genesys-cloud-mcp-server/dist/index.js"],
      "env": {
        "GENESYSCLOUD_PROFILES_FILE": "/absolute/path/genesys-profiles.local.json",
        "GENESYSCLOUD_PROFILE": "client-b-sg"
      }
    }
  }
}
```

For a new chat, select or enable only the intended connection in your MCP
application. Chat boundaries and connection selection depend on that
application; the server does not infer a client from chat text or expose a
tool to switch clients.

### Named HTTP connections

Run one HTTP server with the profiles file:

```bash
GENESYSCLOUD_PROFILES_FILE=/absolute/path/genesys-profiles.local.json \
npm run start:http
```

Configure separate HTTP connections in your MCP application:

- Client A: `http://127.0.0.1:3000/mcp/client-a-jp`
- Client B: `http://127.0.0.1:3000/mcp/client-b-sg`

Each URL is bound to its profile. SDK clients, authentication, and OAuth usage
caches are separate per profile and reused across requests to that profile.
The transport remains stateless; reconnecting does not change the target.

With a profiles file, `/mcp` requires an explicit default selected through
`GENESYSCLOUD_PROFILE`; otherwise use a named URL. Unknown profiles fail
without falling back to another client's credentials. Profiles take
precedence over the single-organization environment variables. The original
single-organization configuration still works without a profiles file or
profile selector.

The server reads the file at startup. Restart it after adding profiles or
rotating credentials. The existing queue-creation flag applies to all profiles.
Profile URLs are routing identifiers, not authorization: anyone who can reach
the server can request any configured profile. Apply the HTTP access controls
described below, including per-profile authorization if callers have different
client access.

## Local Docker

Copy `.env.example` to `.env`, fill in the Genesys region and OAuth client
credentials, and enable only the write tools you need. For YAML publication,
set `GENESYSCLOUD_ENABLE_ARCHITECT_WRITES=true`. Then run:

```bash
docker compose up --build -d
```

Connect the MCP client to `http://127.0.0.1:3000/mcp`. The Compose port
binding is localhost-only; the HTTP server itself has no user authentication.
This Compose configuration uses the single-organization environment variables.

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

The extension settings configure one organization. For named client
connections, use the Node or HTTP configuration above.

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
