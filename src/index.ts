import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpServer } from "./http.js";
import { createMcpServerFactory } from "./server.js";

const transportType = process.env.MCP_TRANSPORT ?? "stdio";

if (transportType === "http") {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !allowedHosts?.length &&
    !["127.0.0.1", "localhost", "::1"].includes(host)
  ) {
    throw new Error(
      "MCP_ALLOWED_HOSTS is required when listening outside localhost",
    );
  }
  const httpServer = createHttpServer(
    allowedHosts?.length ? allowedHosts : undefined,
  );

  httpServer.listen(port, host, () => {
    console.error(
      `Solutif Genesys Cloud MCP Server listening on http://${host}:${port}/mcp`,
    );
  });
} else if (transportType === "stdio") {
  const server = createMcpServerFactory()();
  await server.connect(new StdioServerTransport());
  console.error("Solutif Genesys Cloud MCP Server running on stdio");
} else {
  throw new Error('MCP_TRANSPORT must be either "stdio" or "http"');
}
