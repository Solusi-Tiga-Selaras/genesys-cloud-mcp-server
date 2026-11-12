import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { z } from "zod";
import type { ToolDefinition } from "../utils/createTool.js";
import { architectPublishTools } from "./architectPublish.js";

const jobId = "11111111-1111-4111-8111-111111111111";
const flowId = "22222222-2222-4222-8222-222222222222";
const signedUrl =
  "https://example-bucket.s3.us-east-1.amazonaws.com/flow?X-Amz-Signature=secret-signature";
const signedHeaders = {
  "x-amz-meta-token": "secret-header",
  "Content-Type": "application/yaml",
};

function content(value: { content: unknown }) {
  return JSON.stringify(value.content);
}

describe("Architect publish tools", () => {
  const api = { postFlowsJobs: vi.fn(), getFlowsJob: vi.fn() };
  const upload = vi.fn();
  let client: Client;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", upload);
    api.postFlowsJobs.mockResolvedValue({
      id: jobId,
      presignedUrl: signedUrl,
      headers: signedHeaders,
    });
    upload.mockResolvedValue({ ok: true });
    const server = new McpServer({ name: "test", version: "1" });
    for (const tool of architectPublishTools({
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

  afterEach(() => vi.unstubAllGlobals());

  test("uploads raw YAML with signed headers without Genesys credentials, and returns only an unconfirmed job", async () => {
    const yaml = "outboundCall:\n  name: Test\n";
    const result = await client.callTool({
      name: "publish_architect_flow",
      arguments: { yaml },
    });
    expect(api.postFlowsJobs).toHaveBeenCalledWith();
    expect(upload).toHaveBeenCalledOnce();
    const [url, options] = upload.mock.calls[0];
    expect(url.toString()).toBe(signedUrl);
    expect(options).toMatchObject({
      method: "PUT",
      body: yaml,
      redirect: "manual",
      headers: {
        "x-amz-meta-token": "secret-header",
        "content-type": "application/yaml",
      },
    });
    expect(options.headers.authorization).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(content(result)).toContain(jobId);
    expect(content(result)).toContain("submitted");
    expect(content(result)).not.toContain("secret");
    expect(result.isError).not.toBe(true);
    const tools = await client.listTools();
    expect(
      tools.tools.find((tool) => tool.name === "publish_architect_flow")
        ?.annotations?.readOnlyHint,
    ).toBe(false);
    expect(
      tools.tools.find((tool) => tool.name === "get_architect_publish_job")
        ?.annotations?.readOnlyHint,
    ).toBe(true);
  });

  test.each([
    "http://example-bucket.s3.us-east-1.amazonaws.com/flow",
    "https://127.0.0.1/flow",
    "https://169.254.169.254/latest/meta-data",
    "https://evil.example/flow",
    "https://example-bucket.s3.us-east-1.amazonaws.com.evil.example/flow",
    "https://example-bucket.s3.us-east-1.amazonaws.com:8443/flow",
    "https://user@example-bucket.s3.us-east-1.amazonaws.com/flow",
    "https://ec2.us-east-1.amazonaws.com/flow",
  ])("rejects unsafe upload destination %s", async (destination) => {
    api.postFlowsJobs.mockResolvedValue({
      id: jobId,
      presignedUrl: destination,
      headers: signedHeaders,
    });
    const result = await client.callTool({
      name: "publish_architect_flow",
      arguments: { yaml: "a: b" },
    });
    expect(result.isError).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(content(result)).not.toContain(destination);
    expect(content(result)).not.toContain("secret-header");
  });

  test.each([
    { Authorization: "Bearer secret" },
    { host: "internal" },
    { "x-amz-meta-test": "bad\r\nheader" },
  ])("rejects unsafe signed headers", async (headers) => {
    api.postFlowsJobs.mockResolvedValue({
      id: jobId,
      presignedUrl: signedUrl,
      headers,
    });
    const result = await client.callTool({
      name: "publish_architect_flow",
      arguments: { yaml: "a: b" },
    });
    expect(result.isError).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(content(result)).not.toContain("secret");
  });

  test("rejects oversized UTF-8 before creating a job", async () => {
    const result = await client.callTool({
      name: "publish_architect_flow",
      arguments: { yaml: "é".repeat(3 * 1024 * 1024) },
    });
    expect(result.isError).toBe(true);
    expect(api.postFlowsJobs).not.toHaveBeenCalled();
  });

  test("does not expose credentials from registration or upload errors", async () => {
    api.postFlowsJobs.mockRejectedValueOnce(new Error(signedUrl));
    const registration = await client.callTool({
      name: "publish_architect_flow",
      arguments: { yaml: "a: b" },
    });
    expect(registration.isError).toBe(true);
    expect(content(registration)).not.toContain("secret");
    upload.mockRejectedValueOnce(new Error(`${signedUrl} secret-header`));
    const failure = await client.callTool({
      name: "publish_architect_flow",
      arguments: { yaml: "a: b" },
    });
    expect(failure.isError).toBe(true);
    expect(content(failure)).toContain(jobId);
    expect(content(failure)).not.toContain("secret");
  });

  test.each([
    302, 403, 500,
  ])("does not follow redirects or report failed uploads as published (%s)", async (status) => {
    upload.mockResolvedValue({
      ok: false,
      status,
      headers: { location: "https://evil.example" },
    });
    const result = await client.callTool({
      name: "publish_architect_flow",
      arguments: { yaml: "a: b" },
    });
    expect(result.isError).toBe(true);
    expect(content(result)).toContain(jobId);
    expect(content(result)).not.toContain("secret");
    expect(upload.mock.calls[0][1].redirect).toBe("manual");
  });

  test.each([
    ["Success", "Success", false],
    ["Failure", "Failure", true],
    ["Running", "Pending", false],
    [undefined, "Pending", false],
  ])("reports job state %s without exposing response secrets", async (apiStatus, expected, isError) => {
    api.getFlowsJob.mockResolvedValue({
      status: apiStatus,
      flow: { id: flowId },
      messages: [{ text: signedUrl }],
      headers: signedHeaders,
    });
    const result = await client.callTool({
      name: "get_architect_publish_job",
      arguments: { jobId },
    });
    expect(api.getFlowsJob).toHaveBeenCalledWith(jobId, {
      expand: ["messages"],
    });
    expect(content(result)).toContain(expected);
    expect(content(result)).toContain(flowId);
    expect(content(result)).not.toContain("secret");
    expect(Boolean(result.isError)).toBe(isError);
  });

  test("sanitizes job status errors", async () => {
    api.getFlowsJob.mockRejectedValue(new Error(signedUrl));
    const result = await client.callTool({
      name: "get_architect_publish_job",
      arguments: { jobId },
    });
    expect(result.isError).toBe(true);
    expect(content(result)).not.toContain("secret");
  });
});
