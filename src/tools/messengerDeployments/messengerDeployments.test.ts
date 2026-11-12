import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { z } from "zod";
import type { ToolDefinition } from "../utils/createTool.js";
import { messengerDeploymentTools } from "./messengerDeployments.js";

describe("Messenger deployment tools", () => {
  const api = {
    getWebdeploymentsDeployments: vi.fn(),
    getWebdeploymentsDeployment: vi.fn(),
    getWebdeploymentsDeploymentConfigurations: vi.fn(),
    postWebdeploymentsDeployments: vi.fn(),
    putWebdeploymentsDeployment: vi.fn(),
  };
  let client: Client;

  beforeEach(async () => {
    vi.resetAllMocks();
    const server = new McpServer({ name: "test", version: "1" });
    for (const tool of messengerDeploymentTools({
      webDeploymentsApi: api,
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

  test("merges nested changes into the fetched deployment and replaces arrays", async () => {
    const current = {
      id: "deployment-1",
      name: "Original",
      description: "Keep me",
      allowedDomains: ["old.example"],
      allowAllDomains: false,
      configuration: {
        id: "config-1",
        version: "1",
        name: "Config",
        futureRef: "preserve",
      },
      pushIntegrations: [{ id: "push-1", provider: "FCM" }],
      futureField: { nested: { retained: true, changed: "old" } },
    };
    api.getWebdeploymentsDeployment.mockResolvedValue(current);
    const expected = {
      ...current,
      name: "Updated",
      allowedDomains: [],
      configuration: { ...current.configuration, version: "2" },
      futureField: { nested: { retained: true, changed: "new" } },
    };
    api.putWebdeploymentsDeployment.mockResolvedValue(expected);
    const result = await client.callTool({
      name: "update_messenger_deployment",
      arguments: {
        deploymentId: "deployment-1",
        changes: {
          name: "Updated",
          allowedDomains: [],
          configuration: { version: "2" },
          futureField: { nested: { changed: "new" } },
        },
      },
    });
    expect(api.getWebdeploymentsDeployment).toHaveBeenCalledWith(
      "deployment-1",
    );
    expect(api.putWebdeploymentsDeployment).toHaveBeenCalledWith(
      "deployment-1",
      expected,
    );
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify(expected) },
    ]);
    expect(current.configuration.version).toBe("1");
  });

  test("does not write if reading the current deployment fails and preserves error details", async () => {
    api.getWebdeploymentsDeployment.mockRejectedValue(
      Object.assign(new Error("Forbidden"), {
        status: 403,
        body: { code: "not.authorized" },
      }),
    );
    const result = await client.callTool({
      name: "update_messenger_deployment",
      arguments: { deploymentId: "d", changes: { name: "New" } },
    });
    expect(api.putWebdeploymentsDeployment).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(
      JSON.parse((result.content as Array<{ text: string }>)[0].text),
    ).toMatchObject({
      error: {
        message: "Forbidden",
        status: 403,
        body: { code: "not.authorized" },
      },
    });
  });

  test("passes complete create payload through and marks mutations as writes", async () => {
    const deployment = {
      name: "Messenger",
      configuration: { id: "c", version: "1", extra: true },
      allowedDomains: ["example.com"],
      future: { enabled: true },
    };
    api.postWebdeploymentsDeployments.mockResolvedValue(deployment);
    const result = await client.callTool({
      name: "create_messenger_deployment",
      arguments: { deployment },
    });
    expect(api.postWebdeploymentsDeployments).toHaveBeenCalledWith(deployment);
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify(deployment) },
    ]);
  });
});
