import { z } from "zod";
import { createTool, type ToolFactory } from "../utils/createTool.js";
import { errorResult } from "../utils/errorResult.js";

const SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const FORUM_HOST = "community.genesys.com";

interface FirecrawlResponse {
  success?: boolean;
  error?: string;
  creditsUsed?: number;
  data?: {
    web?: {
      title?: string;
      url?: string;
      description?: string;
    }[];
  };
}

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

export interface ToolDependencies {
  readonly apiKey: string;
  readonly fetchUrl: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<FetchResponse>;
}

const paramsSchema = z.object({
  query: z
    .string()
    .min(2)
    .max(200)
    .describe("Search terms for the Genesys Cloud Developer Community"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Maximum number of forum discussions to return. Defaults to 5"),
});

export const searchGenesysCloudDeveloperForum: ToolFactory<
  ToolDependencies,
  typeof paramsSchema
> = ({ apiKey, fetchUrl }) =>
  createTool({
    schema: {
      name: "search_genesys_cloud_developer_forum",
      annotations: {
        title: "Search Genesys Cloud Developer Forum",
        openWorldHint: true,
      },
      description:
        "Searches public Genesys Cloud Developer Community discussions through Firecrawl and returns relevant titles, links, and excerpts.",
      paramsSchema,
    },
    call: async ({ query, limit = 5 }) => {
      try {
        const response = await fetchUrl(SEARCH_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `Genesys Cloud Developer Community ${query}`,
            limit: 10,
            sources: ["web"],
            includeDomains: [FORUM_HOST],
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          return errorResult(
            `Failed to search Genesys Cloud Developer Forum: ${response.status} ${response.statusText}`,
          );
        }

        const data = (await response.json()) as FirecrawlResponse;
        if (data.success === false) {
          return errorResult(
            `Failed to search Genesys Cloud Developer Forum: ${data.error ?? "Unknown Firecrawl error"}`,
          );
        }

        const results = (data.data?.web ?? [])
          .filter((result) => {
            if (!result.title || !result.url) return false;
            try {
              const url = new URL(result.url);
              return (
                url.hostname === FORUM_HOST &&
                url.pathname.startsWith("/discussion/")
              );
            } catch {
              return false;
            }
          })
          .slice(0, limit)
          .map((result) => ({
            title: result.title,
            url: result.url,
            ...(result.description ? { excerpt: result.description } : {}),
          }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                results,
                ...(data.creditsUsed !== undefined
                  ? { creditsUsed: data.creditsUsed }
                  : {}),
              }),
            },
          ],
        };
      } catch (error: unknown) {
        return errorResult(
          `Failed to search Genesys Cloud Developer Forum: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      }
    },
  });
