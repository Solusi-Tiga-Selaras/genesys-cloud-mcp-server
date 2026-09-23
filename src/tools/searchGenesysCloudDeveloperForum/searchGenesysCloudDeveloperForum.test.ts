import { describe, expect, test, vi } from "vitest";
import { searchGenesysCloudDeveloperForum } from "./searchGenesysCloudDeveloperForum.js";

describe("Search Genesys Cloud Developer Forum Tool", () => {
  test("searches Firecrawl and only returns forum discussions", async () => {
    const fetchUrl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        success: true,
        creditsUsed: 2,
        data: {
          web: [
            {
              title: "Community home",
              url: "https://community.genesys.com/communities/community-home",
            },
            {
              title: "Conversation analytics question",
              url: "https://community.genesys.com/discussion/conversation-analytics",
              description: "A useful answer.",
            },
            {
              title: "Untrusted result",
              url: "https://example.com/discussion/not-genesys",
            },
          ],
        },
      }),
    });

    const result = await searchGenesysCloudDeveloperForum({
      apiKey: "test-key",
      fetchUrl,
    }).call({ query: "conversation analytics" });

    const [url, request] = fetchUrl.mock.calls[0];
    expect(url).toBe("https://api.firecrawl.dev/v2/search");
    expect(request.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(request.body)).toMatchObject({
      query: "Genesys Cloud Developer Community conversation analytics",
      includeDomains: ["community.genesys.com"],
    });
    expect(result).toStrictEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results: [
              {
                title: "Conversation analytics question",
                url: "https://community.genesys.com/discussion/conversation-analytics",
                excerpt: "A useful answer.",
              },
            ],
            creditsUsed: 2,
          }),
        },
      ],
    });
  });

  test("returns Firecrawl errors", async () => {
    const result = await searchGenesysCloudDeveloperForum({
      apiKey: "test-key",
      fetchUrl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ success: false, error: "Quota exceeded" }),
      }),
    }).call({ query: "routing" });

    expect(result).toStrictEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            errorMessage:
              "Failed to search Genesys Cloud Developer Forum: Quota exceeded",
          }),
        },
      ],
    });
  });
});
