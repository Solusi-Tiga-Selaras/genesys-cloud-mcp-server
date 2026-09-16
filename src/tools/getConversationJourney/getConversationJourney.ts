import type { AnalyticsApi, Models } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool, type ToolFactory } from "../utils/createTool.js";
import { errorResult } from "../utils/errorResult.js";
import { isUnauthorisedError } from "../utils/genesys/isUnauthorisedError.js";

export interface ToolDependencies {
  readonly analyticsApi: Pick<AnalyticsApi, "getAnalyticsConversationDetails">;
}

const paramsSchema = z.object({
  conversationId: z
    .string()
    .uuid()
    .describe("The UUID of the conversation to retrieve"),
});

const metricTotal = (sessions: Models.AnalyticsSession[], metricName: string) =>
  sessions
    .flatMap((session) => session.metrics ?? [])
    .filter((metric) => metric.name === metricName)
    .reduce((total, metric) => total + (metric.value ?? 0), 0);

export const getConversationJourney: ToolFactory<
  ToolDependencies,
  typeof paramsSchema
> = ({ analyticsApi }) =>
  createTool({
    schema: {
      name: "get_conversation_journey",
      description:
        "Retrieves a conversation's participants, sessions, and chronologically ordered segments for operational investigation. Also returns deterministic transfer and queue-wait totals. Requires analytics:conversationDetail:view.",
      annotations: {
        title: "Get Conversation Journey",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      paramsSchema,
    },
    call: async ({ conversationId }) => {
      let conversation: Models.AnalyticsConversationWithoutAttributes;

      try {
        conversation =
          await analyticsApi.getAnalyticsConversationDetails(conversationId);
      } catch (error) {
        return errorResult(
          isUnauthorisedError(error)
            ? "Failed to retrieve conversation journey: Unauthorised access. Please check API credentials or permissions"
            : "Failed to retrieve conversation journey from Genesys Cloud",
        );
      }

      const participants = conversation.participants ?? [];
      const sessions = participants.flatMap(
        (participant) => participant.sessions ?? [],
      );
      const segments = participants
        .flatMap((participant) =>
          (participant.sessions ?? []).flatMap((session) =>
            (session.segments ?? []).map((segment) => ({
              segmentStart: segment.segmentStart,
              segmentEnd: segment.segmentEnd,
              segmentType: segment.segmentType,
              participantId: participant.participantId,
              participantName: participant.participantName,
              participantPurpose: participant.purpose,
              userId: participant.userId,
              sessionId: session.sessionId,
              mediaType: session.mediaType,
              direction: session.direction,
              queueId: segment.queueId,
              disconnectType: segment.disconnectType,
              wrapUpCode: segment.wrapUpCode,
              sourceConversationId: segment.sourceConversationId,
              destinationConversationId: segment.destinationConversationId,
              flowId: session.flow?.flowId,
              flowName: session.flow?.flowName,
              flowType: session.flow?.flowType,
            })),
          ),
        )
        .sort((a, b) =>
          (a.segmentStart ?? "\uffff").localeCompare(
            b.segmentStart ?? "\uffff",
          ),
        );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              conversationId: conversation.conversationId ?? conversationId,
              conversationStart: conversation.conversationStart,
              conversationEnd: conversation.conversationEnd,
              originatingDirection: conversation.originatingDirection,
              mediaTypes: [
                ...new Set(
                  sessions
                    .map((session) => session.mediaType)
                    .filter((mediaType): mediaType is string => !!mediaType),
                ),
              ].sort(),
              participants: participants.map((participant) => ({
                participantId: participant.participantId,
                participantName: participant.participantName,
                purpose: participant.purpose,
                userId: participant.userId,
                externalContactId: participant.externalContactId,
                externalOrganizationId: participant.externalOrganizationId,
                queueIds: [
                  ...new Set(
                    (participant.sessions ?? [])
                      .flatMap((session) => session.segments ?? [])
                      .map((segment) => segment.queueId)
                      .filter((queueId): queueId is string => !!queueId),
                  ),
                ],
                sessions: (participant.sessions ?? []).map((session) => ({
                  sessionId: session.sessionId,
                  mediaType: session.mediaType,
                  direction: session.direction,
                  addressFrom: session.addressFrom,
                  addressTo: session.addressTo,
                  addressOther: session.addressOther,
                  remote: session.remote,
                })),
              })),
              segments,
              transferCount: metricTotal(sessions, "nTransferred"),
              totalQueueWaitMs: metricTotal(sessions, "tQueue"),
            }),
          },
        ],
      };
    },
  });
