import { z } from "zod";
import { createTool, type ToolFactory } from "../utils/createTool.js";
import { errorResult } from "../utils/errorResult.js";

const SEARCH_URL = "https://developer.genesys.cloud/search";
const DOCS_URL = "https://developer.genesys.cloud/";

interface SearchResultItem {
  DocumentTitle?: { Text?: string };
  DocumentExcerpt?: { Text?: string };
  DocumentAttributes?: {
    Key?: string;
    Value?: { StringValue?: string };
  }[];
}

interface SearchResponse {
  QueryResults?: {
    TotalNumberOfResults?: number;
    ResultItems?: SearchResultItem[];
  };
}

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

export interface ToolDependencies {
  readonly fetchUrl: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<FetchResponse>;
}

function attribute(item: SearchResultItem, key: string): string | undefined {
  return item.DocumentAttributes?.find((entry) => entry.Key === key)?.Value
    ?.StringValue;
}

const paramsSchema = z.object({
  query: z
    .string()
    .min(2)
    .max(60)
    .describe("Search terms for the Genesys Cloud documentation"),
  source: z
    .enum(["developer-center", "resource-center", "all"])
    .optional()
    .describe(
      "Documentation source to search. Defaults to all (Developer Center and Resource Center)",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Maximum number of results to return. Defaults to 5"),
});

export const searchGenesysCloudDocs: ToolFactory<
  ToolDependencies,
  typeof paramsSchema
> = ({ fetchUrl }) =>
  createTool({
    schema: {
      name: "search_genesys_cloud_docs",
      annotations: {
        title: "Search Genesys Cloud Docs",
        openWorldHint: true,
      },
      description:
        "Searches the public Genesys Cloud Developer Center and Resource Center and returns relevant documentation links and excerpts. No Genesys Cloud organisation credentials are required.",
      paramsSchema,
    },
    call: async ({ query, source = "all", limit = 5 }) => {
      try {
        const sources =
          source === "all" ? ["developer-center", "resource-center"] : [source];
        const response = await fetchUrl(SEARCH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queryText: query,
            includeSpellCheckSuggestions: true,
            attributeFilterGroups: [
              {
                type: "or",
                attributeFilters: sources.map((value) => ({
                  key: "origin",
                  value,
                })),
              },
            ],
            documentRelevanceOverrideConfigurations: [
              { name: "_document_title", relevance: { importance: 7 } },
            ],
          }),
        });

        if (!response.ok) {
          return errorResult(
            `Failed to search Genesys Cloud docs: ${response.status} ${response.statusText}`,
          );
        }

        const data = (await response.json()) as SearchResponse;
        const queryResults = data.QueryResults;
        const results = (queryResults?.ResultItems ?? [])
          .map((item) => {
            const title = item.DocumentTitle?.Text;
            const link = attribute(item, "link");
            if (!title || !link) return undefined;

            return {
              title,
              url: new URL(link, DOCS_URL).href,
              ...(attribute(item, "origin")
                ? { source: attribute(item, "origin") }
                : {}),
              ...(item.DocumentExcerpt?.Text
                ? { excerpt: item.DocumentExcerpt.Text }
                : {}),
              ...(attribute(item, "documentType")
                ? { documentType: attribute(item, "documentType") }
                : {}),
              ...(attribute(item, "topic")
                ? { topic: attribute(item, "topic") }
                : {}),
            };
          })
          .filter((result) => result !== undefined)
          .slice(0, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                totalResults: queryResults?.TotalNumberOfResults ?? 0,
                results,
              }),
            },
          ],
        };
      } catch (error: unknown) {
        return errorResult(
          `Failed to search Genesys Cloud docs: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      }
    },
  });
