import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { z } from "zod";
import type { ToolDefinition } from "../utils/createTool.js";
import { architectReadTools } from "./architectReads.js";

describe("Architect read tools", () => {
  const api = { getFlows: vi.fn(), getFlow: vi.fn() };
  let client: Client;

  beforeEach(async () => {
    vi.resetAllMocks();
    const server = new McpServer({ name: "test", version: "1" });
    for (const tool of architectReadTools({
      architectApi: api,
    }) as unknown as ToolDefinition<z.ZodObject>[]) {
      server.tool(
        tool.schema.name,
        tool.schema.description,
        tool.schema.paramsSchema.shape,
        tool.schema.annotations,
        tool.call,
      );
    }
    const [serverTransport, clientTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test", version: "1" });
    await client.connect(clientTransport);
  });

  test("reports API failures without exposing request headers", async () => {
    api.getFlows.mockRejectedValue(
      Object.assign(new Error("Forbidden"), {
        status: 403,
        code: "not.authorized",
        headers: { authorization: "secret" },
      }),
    );
    const result = await client.callTool({
      name: "list_architect_flows",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(
      JSON.parse((result.content as Array<{ text: string }>)[0].text),
    ).toEqual({
      errorMessage: "Failed to list Architect flows",
      error: { message: "Forbidden", status: 403, code: "not.authorized" },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("reports flow retrieval errors", async () => {
    api.getFlow.mockRejectedValue(new Error("Not found"));
    const result = await client.callTool({
      name: "get_architect_flow",
      arguments: { flowId: "missing" },
    });
    expect(result.isError).toBe(true);
    expect(
      JSON.parse((result.content as Array<{ text: string }>)[0].text),
    ).toMatchObject({
      errorMessage: "Failed to get Architect flow",
      error: { message: "Not found" },
    });
  });

  test("rejects invalid page numbers and empty flow IDs without calling Genesys", async () => {
    const list = await client.callTool({
      name: "list_architect_flows",
      arguments: { pageNumber: 0 },
    });
    const get = await client.callTool({
      name: "get_architect_flow",
      arguments: { flowId: "" },
    });
    expect(list.isError).toBe(true);
    expect(get.isError).toBe(true);
    expect(api.getFlows).not.toHaveBeenCalled();
    expect(api.getFlow).not.toHaveBeenCalled();
  });
});
