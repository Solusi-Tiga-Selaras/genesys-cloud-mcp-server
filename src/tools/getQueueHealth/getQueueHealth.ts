import type { AnalyticsApi, Models } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool, type ToolFactory } from "../utils/createTool.js";
import { errorResult } from "../utils/errorResult.js";
import { isMissingPermissionsError } from "../utils/genesys/isMissingPermissionsError.js";
import { isUnauthorisedError } from "../utils/genesys/isUnauthorisedError.js";

export interface ToolDependencies {
  readonly analyticsApi: Pick<
    AnalyticsApi,
    "postAnalyticsQueuesObservationsQuery"
  >;
}

const mediaTypeSchema = z.enum([
  "voice",
  "chat",
  "email",
  "callback",
  "message",
]);

const paramsSchema = z.object({
  queueIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .describe("One to 100 routing queue UUIDs"),
  mediaTypes: z
    .array(mediaTypeSchema)
    .min(1)
    .max(5)
    .optional()
    .describe(
      "Optional media types to return. Defaults to every media type returned by Genesys Cloud",
    ),
});

function metricStat(
  data: Models.ObservationMetricData[],
  metric: string,
  stat: "count" | "max",
): number | null {
  return data.find((item) => item.metric === metric)?.stats?.[stat] ?? null;
}

export const getQueueHealth: ToolFactory<
  ToolDependencies,
  typeof paramsSchema
> = ({ analyticsApi }) =>
  createTool({
    schema: {
      name: "get_queue_health",
      annotations: { title: "Get Queue Health" },
      description:
        "Returns a real-time snapshot of queue health: agents with the IDLE on-queue routing status, plus waiting, interacting, and longest-wait metrics by media type. Missing metrics are returned as null. Requires analytics:queueObservation:view.",
      paramsSchema,
    },
    call: async ({ queueIds, mediaTypes }) => {
      let response: Models.QueueObservationQueryResponse;
      try {
        response = await analyticsApi.postAnalyticsQueuesObservationsQuery({
          filter: {
            type: "or",
            predicates: queueIds.map((queueId) => ({
              dimension: "queueId",
              value: queueId,
            })),
          },
          metrics: [
            "oWaiting",
            "oInteracting",
            "oLongestWaiting",
            "oOnQueueUsers",
          ],
        });
      } catch (error: unknown) {
        const unauthorized =
          isUnauthorisedError(error) || isMissingPermissionsError(error);
        return errorResult(
          unauthorized
            ? "Failed to retrieve queue health: Unauthorised access. Please check API credentials or analytics:queueObservation:view permission"
            : `Failed to retrieve queue health: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      }

      const queues = new Map(
        queueIds.map((queueId) => [
          queueId,
          {
            queueId,
            availableAgents: null as number | null,
            media: new Map<
              string,
              {
                mediaType: string;
                waiting: number | null;
                interacting: number | null;
                longestWaitingMs: number | null;
              }
            >(),
          },
        ]),
      );
      const selectedMediaTypes = mediaTypes
        ? new Set<string>(mediaTypes)
        : undefined;

      for (const result of response.results ?? []) {
        const queue = result.group?.queueId
          ? queues.get(result.group.queueId)
          : undefined;
        if (!queue) continue;

        const data = result.data ?? [];
        const statusMetrics = data.filter(
          (metric) => metric.metric === "oOnQueueUsers",
        );
        if (statusMetrics.length) {
          queue.availableAgents =
            statusMetrics.find((metric) => metric.qualifier === "IDLE")?.stats
              ?.count ?? 0;
        }

        const mediaType = result.group?.mediaType;
        if (
          !mediaType ||
          (selectedMediaTypes && !selectedMediaTypes.has(mediaType))
        ) {
          continue;
        }
        queue.media.set(mediaType, {
          mediaType,
          waiting: metricStat(data, "oWaiting", "count"),
          interacting: metricStat(data, "oInteracting", "count"),
          longestWaitingMs: metricStat(data, "oLongestWaiting", "max"),
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              observedAt: new Date().toISOString(),
              queues: [...queues.values()].map((queue) => ({
                queueId: queue.queueId,
                availableAgents: queue.availableAgents,
                media: mediaTypes
                  ? mediaTypes.map(
                      (mediaType) =>
                        queue.media.get(mediaType) ?? {
                          mediaType,
                          waiting: null,
                          interacting: null,
                          longestWaitingMs: null,
                        },
                    )
                  : [...queue.media.values()].sort((a, b) =>
                      a.mediaType.localeCompare(b.mediaType),
                    ),
              })),
            }),
          },
        ],
      };
    },
  });
