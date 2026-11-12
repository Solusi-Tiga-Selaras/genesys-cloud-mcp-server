import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, test, vi } from "vitest";
import {
  messengerConfigurationTools,
  type ToolDependencies,
} from "./messengerConfigurations.js";

describe("Messenger configuration tools", () => {
  function setup() {
    const webDeploymentsApi = {
      getWebdeploymentsConfigurations: vi.fn(),
      getWebdeploymentsConfigurationVersionsDraft: vi.fn(),
      getWebdeploymentsConfigurationVersions: vi.fn(),
      getWebdeploymentsConfigurationVersion: vi.fn(),
      postWebdeploymentsConfigurations: vi.fn(),
      putWebdeploymentsConfigurationVersionsDraft: vi.fn(),
      postWebdeploymentsConfigurationVersionsDraftPublish: vi.fn(),
    } satisfies ToolDependencies["webDeploymentsApi"];
    return {
      webDeploymentsApi,
      tools: messengerConfigurationTools({ webDeploymentsApi }),
    };
  }

  test("PUT sends the entire supplied draft, including unknown nested and top-level settings, without publishing", async () => {
    const { webDeploymentsApi, tools } = setup();
    const server = new McpServer({ name: "test", version: "1" });
    for (const tool of tools) {
      server.tool(
        tool.schema.name,
        tool.schema.description,
        tool.schema.paramsSchema.shape,
        tool.schema.annotations,
        (params) => tool.call(params as never),
      );
    }
    const [serverTransport, clientTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test", version: "1" });
    await client.connect(clientTransport);

    const draft = {
      name: "Updated",
      id: "cfg",
      version: "draft",
      messenger: {
        enabled: true,
        apps: { futureSetting: [1, { value: false }] },
      },
      supportCenter: { enabled: true, screens: [{ futureField: "keep" }] },
      futureTopLevel: { nested: null },
    };
    webDeploymentsApi.putWebdeploymentsConfigurationVersionsDraft.mockResolvedValue(
      draft,
    );
    const response = await client.callTool({
      name: "update_messenger_configuration_draft",
      arguments: { configurationId: "cfg", configuration: draft },
    });
    expect(
      webDeploymentsApi.putWebdeploymentsConfigurationVersionsDraft,
    ).toHaveBeenCalledWith("cfg", draft);
    expect(
      webDeploymentsApi.postWebdeploymentsConfigurationVersionsDraftPublish,
    ).not.toHaveBeenCalled();
    expect(response.content).toEqual([
      { type: "text", text: JSON.stringify(draft) },
    ]);
    await client.close();
    await server.close();
  });

  test("publish is explicit and surfaces SDK error details", async () => {
    const { webDeploymentsApi, tools } = setup();
    const tool = tools.find(
      (item) => item.schema.name === "publish_messenger_configuration",
    );
    if (!tool) throw new Error("Publish tool is missing");
    const error = Object.assign(new Error("Forbidden"), {
      status: 403,
      body: { code: "missing.permission" },
    });
    webDeploymentsApi.postWebdeploymentsConfigurationVersionsDraftPublish.mockRejectedValue(
      error,
    );
    const response = await tool.call({ configurationId: "cfg" } as never);
    expect(
      webDeploymentsApi.postWebdeploymentsConfigurationVersionsDraftPublish,
    ).toHaveBeenCalledWith("cfg");
    expect(response).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              status: 403,
              body: { code: "missing.permission" },
              name: "Error",
              message: "Forbidden",
            },
          }),
        },
      ],
    });
  });
});
