import {
  createServer as createNodeServer,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConnectionProfiles } from "./connectionProfiles.js";
import { createConfigRetriever } from "./createConfigRetriever.js";
import { createMcpServerFactory, type McpServerFactory } from "./server.js";

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export function createHttpServer(
  allowedHosts?: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const profiles = loadConnectionProfiles(env);
  const factories = new Map<string, McpServerFactory>();
  for (const [name] of profiles) {
    factories.set(
      name,
      createMcpServerFactory(
        createConfigRetriever({ ...env, GENESYSCLOUD_PROFILE: name }, profiles),
      ),
    );
  }
  const defaultFactory = env.GENESYSCLOUD_PROFILE
    ? factories.get(env.GENESYSCLOUD_PROFILE)
    : env.GENESYSCLOUD_PROFILES_FILE
      ? undefined
      : createMcpServerFactory(createConfigRetriever(env, profiles));
  if (env.GENESYSCLOUD_PROFILE && !defaultFactory) {
    throw new Error(
      `Unknown Genesys Cloud profile: ${env.GENESYSCLOUD_PROFILE}`,
    );
  }
  return createNodeServer(async (request, response) => {
    const requestHost = request.headers.host;
    const requestHostname = requestHost?.replace(/:\d+$/, "");
    if (
      allowedHosts?.length &&
      (!requestHost ||
        (!allowedHosts.includes(requestHost) &&
          !allowedHosts.includes(requestHostname ?? "")))
    ) {
      sendJson(response, 403, { error: "Host not allowed" });
      return;
    }

    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET" && path === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    const profileName = path.startsWith("/mcp/") ? path.slice(5) : undefined;
    if (path !== "/mcp" && !profiles.has(profileName ?? "")) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed" },
        id: null,
      });
      return;
    }

    const factory = profileName ? factories.get(profileName) : defaultFactory;
    if (!factory) {
      sendJson(response, 400, {
        error: "Select a profile with /mcp/<profile>",
      });
      return;
    }
    const server = factory();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("Failed to handle MCP request", error);
      if (!response.headersSent) {
        sendJson(response, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });
}
