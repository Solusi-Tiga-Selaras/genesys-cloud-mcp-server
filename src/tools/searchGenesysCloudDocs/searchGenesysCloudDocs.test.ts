import { describe, expect, test, vi } from "vitest";
import { searchGenesysCloudDocs } from "./searchGenesysCloudDocs.js";

describe("Search Genesys Cloud Docs Tool", () => {
  test("searches all public documentation sources and returns compact results", async () => {
    const fetchUrl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        QueryResults: {
          TotalNumberOfResults: 12,
          ResultItems: [
            {
              DocumentTitle: { Text: "Conversation analytics" },
              DocumentExcerpt: { Text: "Query conversation details." },
              DocumentAttributes: [
                { Key: "link", Value: { StringValue: "analytics/details" } },
                {
                  Key: "origin",
                  Value: { StringValue: "developer-center" },
                },
                { Key: "documentType", Value: { StringValue: "guide" } },
                {
                  Key: "topic",
                  Value: { StringValue: "analyticsdatamanagement" },
                },
              ],
            },
            {
              DocumentTitle: { Text: "Second result" },
              DocumentAttributes: [
                { Key: "link", Value: { StringValue: "second" } },
              ],
            },
          ],
        },
      }),
    });

    const result = await searchGenesysCloudDocs({ fetchUrl }).call({
      query: "conversation analytics",
      limit: 1,
    });

    expect(fetchUrl).toHaveBeenCalledOnce();
    const [url, request] = fetchUrl.mock.calls[0];
    expect(url).toBe("https://developer.genesys.cloud/search");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toMatchObject({
      attributeFilterGroups: [
        {
          type: "or",
          attributeFilters: [
            { key: "origin", value: "developer-center" },
            { key: "origin", value: "resource-center" },
          ],
        },
      ],
    });
    expect(result).toStrictEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            totalResults: 12,
            results: [
              {
                title: "Conversation analytics",
                url: "https://developer.genesys.cloud/analytics/details",
                source: "developer-center",
                excerpt: "Query conversation details.",
                documentType: "guide",
                topic: "analyticsdatamanagement",
              },
            ],
          }),
        },
      ],
    });
  });

  test("returns upstream errors", async () => {
    const result = await searchGenesysCloudDocs({
      fetchUrl: vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({}),
      }),
    }).call({ query: "routing" });

    expect(result).toStrictEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            errorMessage:
              "Failed to search Genesys Cloud docs: 503 Service Unavailable",
          }),
        },
      ],
    });
  });
});
