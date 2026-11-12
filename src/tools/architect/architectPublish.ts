import type { ArchitectApi, Models } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool } from "../utils/createTool.js";

export interface ArchitectPublishDependencies {
  readonly architectApi: Pick<ArchitectApi, "postFlowsJobs" | "getFlowsJob">;
}

const maxYamlBytes = 5 * 1024 * 1024;
const uploadTimeoutMs = 20_000;
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function result(value: unknown, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

// Only AWS S3 endpoints are accepted: never arbitrary amazonaws.com hosts, IPs,
// custom ports or redirects. Genesys returns the S3 URL and signed headers.
function uploadUrl(value: unknown): URL | undefined {
  if (typeof value !== "string" || value.length > 8192) return undefined;
  try {
    const url = new URL(value);
    const s3 =
      /^(?:[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\.)?s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !s3.test(url.hostname) ||
      url.pathname === "/"
    )
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function uploadHeaders(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const headers: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    const name = key.toLowerCase();
    if (
      !/^(?:content-type|content-md5|x-amz-[a-z0-9-]+)$/.test(name) ||
      typeof val !== "string" ||
      val.length > 8192 ||
      /[\r\n]/.test(val) ||
      Object.hasOwn(headers, name)
    )
      return undefined;
    headers[name] = val;
  }
  return headers;
}

export function architectPublishTools({
  architectApi,
}: ArchitectPublishDependencies) {
  return [
    createTool({
      schema: {
        name: "publish_architect_flow",
        description:
          "Submit an Architect flow YAML document for immediate creation or update and publication. This does not create a reviewable Genesys draft; review the YAML locally before calling. Upload acceptance is not publication success: check the returned job ID with get_architect_publish_job.",
        annotations: {
          title: "Publish Architect Flow",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
        paramsSchema: z.object({
          yaml: z
            .string()
            .min(1)
            .describe(
              "Complete Architect flow YAML for any supported flow type, at most 5 MiB UTF-8",
            ),
        }),
      },
      call: async ({ yaml }) => {
        if (Buffer.byteLength(yaml, "utf8") > maxYamlBytes) {
          return result({ error: "Flow YAML exceeds the 5 MiB limit." }, true);
        }
        let job: Models.RegisterArchitectJobResponse;
        try {
          job = await architectApi.postFlowsJobs();
        } catch {
          return result(
            { error: "Failed to register the Architect publish job." },
            true,
          );
        }
        const jobId = job?.id;
        const url = uploadUrl(job?.presignedUrl);
        const headers = uploadHeaders(job?.headers);
        if (!jobId || !idPattern.test(jobId) || !url || !headers) {
          return result(
            {
              error:
                "Genesys returned an invalid or unsafe publish job upload destination or headers.",
            },
            true,
          );
        }
        try {
          const response = await fetch(url, {
            method: "PUT",
            headers,
            body: yaml,
            redirect: "manual",
            signal: AbortSignal.timeout(uploadTimeoutMs),
          });
          if (!response.ok) {
            return result(
              {
                error:
                  "Flow YAML upload was not accepted; publication is not confirmed.",
                jobId,
              },
              true,
            );
          }
        } catch {
          return result(
            {
              error:
                "Flow YAML upload failed or timed out; the job may still have started. Check its status before retrying.",
              jobId,
            },
            true,
          );
        }
        return result({
          jobId,
          status: "submitted",
          message:
            "Upload accepted; publication is not yet confirmed. Check the job status.",
        });
      },
    }),
    createTool({
      schema: {
        name: "get_architect_publish_job",
        description:
          "Check an Architect publish job. Only Success confirms publication; Failure means publication failed, and all other statuses remain unconfirmed.",
        annotations: {
          title: "Get Architect Publish Job",
          openWorldHint: true,
        },
        paramsSchema: z.object({
          jobId: z
            .string()
            .regex(idPattern)
            .describe("Architect publish job ID"),
        }),
      },
      call: async ({ jobId }) => {
        try {
          const job = await architectApi.getFlowsJob(jobId, {
            expand: ["messages"],
          });
          const status =
            job?.status === "Success"
              ? "Success"
              : job?.status === "Failure"
                ? "Failure"
                : "Pending";
          const flowId = job?.flow?.id;
          return result(
            {
              jobId,
              status,
              ...(flowId && idPattern.test(flowId) ? { flowId } : {}),
              ...(status === "Failure"
                ? {
                    error:
                      "Architect publish job failed; inspect the flow in Genesys for details.",
                  }
                : {}),
              ...(status === "Pending"
                ? {
                    message:
                      "Publication is not yet confirmed; check the job again.",
                  }
                : {}),
            },
            status === "Failure",
          );
        } catch {
          return result(
            {
              error: "Failed to retrieve the Architect publish job status.",
              jobId,
            },
            true,
          );
        }
      },
    }),
  ];
}
