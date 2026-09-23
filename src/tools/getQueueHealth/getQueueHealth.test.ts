import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { getQueueHealth } from "./getQueueHealth.js";

describe("Get Queue Health Tool", () => {
  test("returns queue-level availability and media-level health", async () => {
    const queueId = randomUUID();
    const emptyQueueId = randomUUID();
    const analyticsApi = {
      postAnalyticsQueuesObservationsQuery: vi.fn().mockResolvedValue({
        results: [
          {
            group: { queueId },
            data: [
              {
                metric: "oOnQueueUsers",
                qualifier: "IDLE",
                stats: { count: 3 },
              },
              {
                metric: "oOnQueueUsers",
                qualifier: "INTERACTING",
                stats: { count: 2 },
              },
            ],
          },
          {
            group: { queueId, mediaType: "voice" },
            data: [
              { metric: "oWaiting", stats: { count: 4 } },
              { metric: "oInteracting", stats: { count: 2 } },
              { metric: "oLongestWaiting", stats: { max: 12_345 } },
            ],
          },
          {
            group: { queueId, mediaType: "chat" },
            data: [{ metric: "oWaiting", stats: { count: 1 } }],
          },
        ],
      }),
    };

    const result = await getQueueHealth({ analyticsApi }).call({
      queueIds: [queueId, emptyQueueId],
      mediaTypes: ["voice", "email"],
    });

    expect(
      analyticsApi.postAnalyticsQueuesObservationsQuery,
    ).toHaveBeenCalledWith({
      filter: {
        type: "or",
        predicates: [queueId, emptyQueueId].map((value) => ({
          dimension: "queueId",
          value,
        })),
      },
      metrics: ["oWaiting", "oInteracting", "oLongestWaiting", "oOnQueueUsers"],
    });

    const content = result.content[0];
    if (content.type !== "text") throw new Error("Expected text result");
    const response = JSON.parse(content.text);
    expect(response.observedAt).toEqual(expect.any(String));
    expect(response.queues).toStrictEqual([
      {
        queueId,
        availableAgents: 3,
        media: [
          {
            mediaType: "voice",
            waiting: 4,
            interacting: 2,
            longestWaitingMs: 12_345,
          },
          {
            mediaType: "email",
            waiting: null,
            interacting: null,
            longestWaitingMs: null,
          },
        ],
      },
      {
        queueId: emptyQueueId,
        availableAgents: null,
        media: [
          {
            mediaType: "voice",
            waiting: null,
            interacting: null,
            longestWaitingMs: null,
          },
          {
            mediaType: "email",
            waiting: null,
            interacting: null,
            longestWaitingMs: null,
          },
        ],
      },
    ]);
  });

  test("returns a clear missing-permission error", async () => {
    const analyticsApi = {
      postAnalyticsQueuesObservationsQuery: vi.fn().mockRejectedValue({
        code: "missing.any.permissions",
        status: 403,
      }),
    };

    const result = await getQueueHealth({ analyticsApi }).call({
      queueIds: [randomUUID()],
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: "text",
          text: expect.stringContaining("analytics:queueObservation:view"),
        },
      ],
    });
  });
});
