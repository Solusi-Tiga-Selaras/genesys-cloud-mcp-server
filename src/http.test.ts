import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "vitest";
import { createHttpServer } from "./http.js";

test("serves MCP tools over Streamable HTTP", async () => {
  const httpServer = createHttpServer(["127.0.0.1"]);
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  const { port } = httpServer.address() as AddressInfo;
  const client = new Client({ name: "http-test-client", version: "1.0.0" });

  try {
    const blockedStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const blockedRequest = request(
          {
            host: "127.0.0.1",
            port,
            path: "/health",
            headers: { host: "untrusted.example" },
          },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode));
          },
        );
        blockedRequest.on("error", reject);
        blockedRequest.end();
      },
    );
    expect(blockedStatus).toBe(403);

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(await health.json()).toStrictEqual({ status: "ok" });

    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`),
      ),
    );
    const { tools } = await client.listTools();

    expect(tools.map(({ name }) => name)).toContain("search_queues");
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
