import type { AnalyticsApi, Models } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool, type ToolFactory } from "../utils/createTool.js";
import { errorResult } from "../utils/errorResult.js";
import { isMissingPermissionsError } from "../utils/genesys/isMissingPermissionsError.js";
import { isUnauthorisedError } from "../utils/genesys/isUnauthorisedError.js";

export interface ToolDependencies {
  readonly analyticsApi: Pick<
    AnalyticsApi,
    "postAnalyticsConversationsAggregatesQuery"
  >;
}

const granularitySchema = z.enum([
  "PT15M",
  "PT30M",
  "PT1H",
  "PT3H",
  "PT6H",
  "PT12H",
  "P1D",
  "P1W",
  "P1M",
]);

const paramsSchema = z.object({
  queueIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .describe("One to 100 routing queue UUIDs"),
  startDate: z
    .string()
    .describe(
      "The start date/time in ISO-8601 format (e.g., '2024-01-01T00:00:00Z')",
    ),
  endDate: z
    .string()
    .describe(
      "The end date/time in ISO-8601 format (e.g., '2024-01-07T23:59:59Z')",
    ),
  granularity: granularitySchema
    .optional()
    .describe(
      "Optional interval granularity. Omitting it returns only queue totals",
    ),
});

const metrics: string[] = [
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

const supportedStats = new Set(["count", "sum", "numerator", "denominator"]);

type Accumulator = Map<string, Map<string, number>>;

interface QueueMetrics {
  offered: number | null;
  answered: number | null;
  abandoned: number | null;
  transferred: number | null;
  overServiceLevel: number | null;
  serviceLevelPercent: number | null;
  asaMs: number | null;
  avgHandleMs: number | null;
  avgTalkMs: number | null;
  avgHoldMs: number | null;
  avgAcwMs: number | null;
}

function addStats(
  accumulator: Accumulator,
  metric: string,
  stats: Models.StatisticalSummary,
): void {
  const perStat = accumulator.get(metric) ?? new Map<string, number>();
  for (const [name, value] of Object.entries(stats)) {
    if (typeof value !== "number" || !supportedStats.has(name)) continue;
    perStat.set(name, (perStat.get(name) ?? 0) + value);
  }
  accumulator.set(metric, perStat);
}

function stat(
  accumulator: Accumulator,
  metric: string,
  name: string,
): number | null {
  return accumulator.get(metric)?.get(name) ?? null;
}

function average(accumulator: Accumulator, metric: string): number | null {
  const sum = stat(accumulator, metric, "sum");
  const count = stat(accumulator, metric, "count");
  if (sum === null || count === null || count === 0) return null;
  return Math.round(sum / count);
}

function serviceLevelPercent(accumulator: Accumulator): number | null {
  const numerator = stat(accumulator, "oServiceLevel", "numerator");
  const denominator = stat(accumulator, "oServiceLevel", "denominator");
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function summarise(accumulator: Accumulator): QueueMetrics {
  return {
    offered: stat(accumulator, "nOffered", "count"),
    answered: stat(accumulator, "tAnswered", "count"),
    abandoned: stat(accumulator, "tAbandon", "count"),
    transferred: stat(accumulator, "nTransferred", "count"),
    overServiceLevel: stat(accumulator, "nOverSLA", "count"),
    serviceLevelPercent: serviceLevelPercent(accumulator),
    asaMs: average(accumulator, "tAnswered"),
    avgHandleMs: average(accumulator, "tHandle"),
    avgTalkMs: average(accumulator, "tTalk"),
    avgHoldMs: average(accumulator, "tHeldComplete"),
    avgAcwMs: average(accumulator, "tAcw"),
  };
}

export const getQueuePerformance: ToolFactory<
  ToolDependencies,
  typeof paramsSchema
> = ({ analyticsApi }) =>
  createTool({
    schema: {
      name: "get_queue_performance",
      annotations: { title: "Get Queue Performance" },
      description:
        "Returns historical queue performance for a time interval: offered, answered, abandoned, and transferred counts, plus service level, average speed of answer (ASA), average handle time (AHT), talk, hold, and after-call work (ACW). Timings are returned in milliseconds and missing metrics are returned as null. Optionally returns interval buckets. Requires analytics:conversationAggregate:view.",
      paramsSchema,
    },
    call: async ({ queueIds, startDate, endDate, granularity }) => {
      const from = new Date(startDate);
      const to = new Date(endDate);

      if (Number.isNaN(from.getTime()))
        return errorResult("startDate is not a valid ISO-8601 date");
      if (Number.isNaN(to.getTime()))
        return errorResult("endDate is not a valid ISO-8601 date");
      if (from >= to) return errorResult("Start date must be before end date");

      let response: Models.ConversationAggregateQueryResponse;
      try {
        response = await analyticsApi.postAnalyticsConversationsAggregatesQuery(
          {
            interval: `${from.toISOString()}/${to.toISOString()}`,
            groupBy: ["queueId"],
            metrics,
            filter: {
              type: "and",
              clauses: [
                {
                  type: "or",
                  predicates: queueIds.map((queueId) => ({
                    dimension: "queueId",
                    value: queueId,
                  })),
                },
                {
                  type: "and",
                  predicates: [{ dimension: "purpose", value: "customer" }],
                },
              ],
            },
            ...(granularity ? { granularity } : {}),
          },
        );
      } catch (error: unknown) {
        const unauthorized =
          isUnauthorisedError(error) || isMissingPermissionsError(error);
        return errorResult(
          unauthorized
            ? "Failed to retrieve queue performance: Unauthorised access. Please check API credentials or analytics:conversationAggregate:view permission"
            : `Failed to retrieve queue performance: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      }

      const totals = new Map<string, Accumulator>(
        queueIds.map((queueId) => [queueId, new Map()]),
      );
      const intervalBuckets = new Map<string, Map<string, Accumulator>>();

      for (const container of response.results ?? []) {
        const queueId = container.group?.queueId;
        if (!queueId) continue;
        const total = totals.get(queueId);
        if (!total) continue;

        const buckets = granularity ? intervalBuckets.get(queueId) : undefined;
        const resolvedBuckets = granularity
          ? (buckets ?? new Map<string, Accumulator>())
          : undefined;

        for (const entry of container.data ?? []) {
          for (const metric of entry.metrics ?? []) {
            if (!metric.metric || !metric.stats) continue;
            addStats(total, metric.metric, metric.stats);
            if (!resolvedBuckets || !entry.interval) continue;
            const bucket = resolvedBuckets.get(entry.interval) ?? new Map();
            addStats(bucket, metric.metric, metric.stats);
            resolvedBuckets.set(entry.interval, bucket);
          }
        }

        if (resolvedBuckets) intervalBuckets.set(queueId, resolvedBuckets);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              interval: {
                startDate: from.toISOString(),
                endDate: to.toISOString(),
                granularity: granularity ?? null,
              },
              queues: queueIds.map((queueId) => ({
                queueId,
                totals: summarise(totals.get(queueId) ?? new Map()),
                ...(granularity
                  ? {
                      intervals: [
                        ...(intervalBuckets.get(queueId)?.entries() ?? []),
                      ]
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([interval, accumulator]) => ({
                          interval,
                          ...summarise(accumulator),
                        })),
                    }
                  : {}),
              })),
            }),
          },
        ],
      };
    },
  });
