import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { getQueuePerformance } from "./getQueuePerformance.js";

const metrics = [
  "nOffered",
  "nOverSLA",
  "nTransferred",
  "tAnswered",
  "tAbandon",
  "tHandle",
  "tTalk",
  "tHeldComplete",
  "tAcw",
  "oServiceLevel",
];

describe("Get Queue Performance Tool", () => {
  test("returns queue totals and optional interval buckets", async () => {
    const queueId = randomUUID();
    const emptyQueueId = randomUUID();
    const analyticsApi = {
      postAnalyticsConversationsAggregatesQuery: vi.fn().mockResolvedValue({
        results: [
          {
            group: { queueId },
            data: [
              {
                interval: "2024-01-01T00:00:00.000Z/2024-01-01T00:30:00.000Z",
                metrics: [
                  { metric: "nOffered", stats: { count: 10 } },
                  { metric: "tAnswered", stats: { count: 8, sum: 8000 } },
                  { metric: "tAbandon", stats: { count: 2, sum: 3000 } },
                  { metric: "nTransferred", stats: { count: 1 } },
                  { metric: "nOverSLA", stats: { count: 1 } },
                  { metric: "tHandle", stats: { count: 8, sum: 160_000 } },
                  { metric: "tTalk", stats: { count: 8, sum: 100_000 } },
                  { metric: "tHeldComplete", stats: { count: 2, sum: 4000 } },
                  { metric: "tAcw", stats: { count: 8, sum: 24_000 } },
                  {
                    metric: "oServiceLevel",
                    stats: { numerator: 6, denominator: 10 },
                  },
                ],
              },
              {
                interval: "2024-01-01T00:30:00.000Z/2024-01-01T01:00:00.000Z",
                metrics: [
                  { metric: "nOffered", stats: { count: 6 } },
                  { metric: "tAnswered", stats: { count: 2, sum: 2000 } },
                  { metric: "tAbandon", stats: { count: 4, sum: 4000 } },
                  {
                    metric: "oServiceLevel",
                    stats: { numerator: 4, denominator: 6 },
                  },
                ],
              },
            ],
          },
        ],
      }),
    };

    const result = await getQueuePerformance({ analyticsApi }).call({
      queueIds: [queueId, emptyQueueId],
      startDate: "2024-01-01T00:00:00Z",
      endDate: "2024-01-07T00:00:00Z",
      granularity: "PT30M",
    });

    expect(
      analyticsApi.postAnalyticsConversationsAggregatesQuery,
    ).toHaveBeenCalledWith({
      interval: "2024-01-01T00:00:00.000Z/2024-01-07T00:00:00.000Z",
      groupBy: ["queueId"],
      metrics,
      filter: {
        type: "and",
        clauses: [
          {
            type: "or",
            predicates: [
              { dimension: "queueId", value: queueId },
              { dimension: "queueId", value: emptyQueueId },
            ],
          },
          {
            type: "and",
            predicates: [{ dimension: "purpose", value: "customer" }],
          },
        ],
      },
      granularity: "PT30M",
    });

    const content = result.content[0];
    if (content.type !== "text") throw new Error("Expected text result");
    const response = JSON.parse(content.text);

    expect(response.interval).toStrictEqual({
      startDate: "2024-01-01T00:00:00.000Z",
      endDate: "2024-01-07T00:00:00.000Z",
      granularity: "PT30M",
    });

    expect(response.queues[0].queueId).toBe(queueId);
    expect(response.queues[0].totals).toStrictEqual({
      offered: 16,
      answered: 10,
      abandoned: 6,
      transferred: 1,
      overServiceLevel: 1,
      serviceLevelPercent: 62.5,
      asaMs: 1000,
      avgHandleMs: 20_000,
      avgTalkMs: 12_500,
      avgHoldMs: 2000,
      avgAcwMs: 3000,
    });
    expect(response.queues[0].intervals).toStrictEqual([
      {
        interval: "2024-01-01T00:00:00.000Z/2024-01-01T00:30:00.000Z",
        offered: 10,
        answered: 8,
        abandoned: 2,
        transferred: 1,
        overServiceLevel: 1,
        serviceLevelPercent: 60,
        asaMs: 1000,
        avgHandleMs: 20_000,
        avgTalkMs: 12_500,
        avgHoldMs: 2000,
        avgAcwMs: 3000,
      },
      {
        interval: "2024-01-01T00:30:00.000Z/2024-01-01T01:00:00.000Z",
        offered: 6,
        answered: 2,
        abandoned: 4,
        transferred: null,
        overServiceLevel: null,
        serviceLevelPercent: 66.67,
        asaMs: 1000,
        avgHandleMs: null,
        avgTalkMs: null,
        avgHoldMs: null,
        avgAcwMs: null,
      },
    ]);

    expect(response.queues[1].queueId).toBe(emptyQueueId);
    expect(response.queues[1].totals).toStrictEqual({
      offered: null,
      answered: null,
      abandoned: null,
      transferred: null,
      overServiceLevel: null,
      serviceLevelPercent: null,
      asaMs: null,
      avgHandleMs: null,
      avgTalkMs: null,
      avgHoldMs: null,
      avgAcwMs: null,
    });
  });

  test("returns only totals when no granularity is requested", async () => {
    const queueId = randomUUID();
    const analyticsApi = {
      postAnalyticsConversationsAggregatesQuery: vi.fn().mockResolvedValue({
        results: [
          {
            group: { queueId },
            data: [
              {
                metrics: [{ metric: "nOffered", stats: { count: 3 } }],
              },
            ],
          },
        ],
      }),
    };

    const result = await getQueuePerformance({ analyticsApi }).call({
      queueIds: [queueId],
      startDate: "2024-01-01T00:00:00Z",
      endDate: "2024-01-07T00:00:00Z",
    });

    expect(
      analyticsApi.postAnalyticsConversationsAggregatesQuery,
    ).toHaveBeenCalledWith(
      expect.not.objectContaining({ granularity: "PT30M" }),
    );

    const content = result.content[0];
    if (content.type !== "text") throw new Error("Expected text result");
    const response = JSON.parse(content.text);
    expect(response.queues[0]).toStrictEqual({
      queueId,
      totals: {
        offered: 3,
        answered: null,
        abandoned: null,
        transferred: null,
        overServiceLevel: null,
        serviceLevelPercent: null,
        asaMs: null,
        avgHandleMs: null,
        avgTalkMs: null,
        avgHoldMs: null,
        avgAcwMs: null,
      },
    });
  });

  test("rejects a reversed interval before calling the API", async () => {
    const analyticsApi = {
      postAnalyticsConversationsAggregatesQuery: vi.fn(),
    };

    const result = await getQueuePerformance({ analyticsApi }).call({
      queueIds: [randomUUID()],
      startDate: "2024-01-07T00:00:00Z",
      endDate: "2024-01-01T00:00:00Z",
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: "text",
          text: expect.stringContaining("Start date must be before end date"),
        },
      ],
    });
    expect(
      analyticsApi.postAnalyticsConversationsAggregatesQuery,
    ).not.toHaveBeenCalled();
  });

  test("returns a clear missing-permission error", async () => {
    const analyticsApi = {
      postAnalyticsConversationsAggregatesQuery: vi.fn().mockRejectedValue({
        code: "missing.any.permissions",
        status: 403,
      }),
    };

    const result = await getQueuePerformance({ analyticsApi }).call({
      queueIds: [randomUUID()],
      startDate: "2024-01-01T00:00:00Z",
      endDate: "2024-01-07T00:00:00Z",
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: "text",
          text: expect.stringContaining("analytics:conversationAggregate:view"),
        },
      ],
    });
  });
});
