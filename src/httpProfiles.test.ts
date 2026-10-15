import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import platformClient, {
  type AbstractHttpClient,
} from "purecloud-platform-client-v2";
import { expect, test, vi } from "vitest";
import { createHttpServer } from "./http.js";

const tenants: Record<
  string,
  { region: "jp" | "sg"; domain: string; totalRequests: number }
> = {
  "client-a": { region: "jp", domain: "mypurecloud.jp", totalRequests: 11 },
  "client-b": { region: "sg", domain: "apse1.pure.cloud", totalRequests: 22 },
  "client-c": { region: "jp", domain: "mypurecloud.jp", totalRequests: 33 },
};

test("named HTTP connections isolate region, credentials, and cached data across new sessions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "genesys-http-profiles-"));
  const file = join(directory, "profiles.json");
  writeFileSync(
    file,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(tenants).map(([name, tenant]) => [
          name,
          {
            region: tenant.region,
            oAuthClientId: name,
            oAuthClientSecret: `secret-${name}`,
          },
        ]),
      ),
    ),
  );
  const logins: string[] = [];
  const usageQueries: string[] = [];
  const loginGate = Promise.withResolvers<void>();
  const prototype = Object.getPrototypeOf(
    platformClient.ApiClient.instance.getHttpClient(),
  ) as AbstractHttpClient;
  const requestSpy = vi
    .spyOn(prototype, "request")
    .mockImplementation(async (options) => {
      const url = new URL(options.url);
      const authorization = String(options.headers?.Authorization);
      let data: unknown;
      if (url.pathname === "/oauth/token") {
        const credentials = Buffer.from(
          authorization.replace(/^Basic /, ""),
          "base64",
        ).toString();
        const [name, secret] = credentials.split(":");
        expect(secret).toBe(`secret-${name}`);
        expect(url.hostname).toBe(`login.${tenants[name].domain}`);
        logins.push(name);
        if (logins.length === Object.keys(tenants).length) loginGate.resolve();
        await loginGate.promise;
        data = { access_token: `token-${name}`, expires_in: 86400 };
      } else {
        const name = authorization.replace(/^Bearer token-/, "");
        const tenant = tenants[name];
        expect(tenant).toBeDefined();
        expect(url.hostname).toBe(`api.${tenant.domain}`);
        if (url.pathname === "/api/v2/routing/queues") {
          data = {
            entities: [{ id: name, name: `Queue ${name}` }],
            pageNumber: 1,
            pageSize: 100,
            pageCount: 1,
            total: 1,
          };
        } else if (url.pathname.endsWith("/usage/query")) {
          usageQueries.push(name);
          data = { executionId: `execution-${name}` };
        } else if (url.pathname.includes("/usage/query/results/")) {
          data = {
            queryStatus: "COMPLETE",
            results: [
              {
                requests: tenant.totalRequests,
                httpMethod: "GET",
                templateUri: "/api/v2/routing/queues",
              },
            ],
          };
        } else {
          throw new Error(`Unexpected Genesys request: ${url.pathname}`);
        }
      }
      return { status: 200, statusText: "OK", headers: {}, data };
    });
  const httpServer = createHttpServer(["127.0.0.1"], {
    GENESYSCLOUD_PROFILES_FILE: file,
  });
  const clients: Client[] = [];
  try {
    const listening = once(httpServer, "listening");
    httpServer.listen(0, "127.0.0.1");
    await listening;
    const { port } = httpServer.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    expect(
      (await fetch(`${base}/mcp/unknown`, { method: "POST" })).status,
    ).toBe(404);
    expect((await fetch(`${base}/mcp`, { method: "POST" })).status).toBe(400);
    expect(logins).toEqual([]);
    for (const name of Object.keys(tenants)) {
      const client = new Client({ name: `test-${name}`, version: "1.0.0" });
      clients.push(client);
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${base}/mcp/${name}`)),
      );
    }
    const results = await Promise.all(
      clients.map((client) =>
        client.callTool({ name: "search_queues", arguments: { name: "*" } }),
      ),
    );
    for (const [index, name] of Object.keys(tenants).entries()) {
      const result = results[index] as CallToolResult;
      expect(result.isError).not.toBe(true);
      const content = result.content[0];
      expect(content.type).toBe("text");
      if (content.type !== "text") throw new Error("Expected text result");
      expect(JSON.parse(content.text).queues).toEqual([
        { id: name, name: `Queue ${name}` },
      ]);
    }
    const usage = {
      name: "oauth_client_usage",
      arguments: {
        oauthClientId: "11111111-1111-4111-8111-111111111111",
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-02T00:00:00Z",
      },
    };
    for (const [index, name] of Object.keys(tenants).entries()) {
      const result = (await clients[index].callTool(usage)) as CallToolResult;
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
      const content = result.content[0];
      if (content.type !== "text") throw new Error("Expected text result");
      expect(JSON.parse(content.text).totalRequests).toBe(
        tenants[name].totalRequests,
      );
    }
    await clients[0].close();
    const reopened = new Client({ name: "new-session", version: "1.0.0" });
    clients.push(reopened);
    await reopened.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp/client-a`)),
    );
    const cached = (await reopened.callTool(usage)) as CallToolResult;
    const content = cached.content[0];
    if (content.type !== "text") throw new Error("Expected text result");
    expect(JSON.parse(content.text).totalRequests).toBe(11);
    expect(logins.sort()).toEqual(Object.keys(tenants).sort());
    expect(usageQueries.sort()).toEqual(Object.keys(tenants).sort());
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    const closed = once(httpServer, "close");
    httpServer.close();
    await closed;
    requestSpy.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});
