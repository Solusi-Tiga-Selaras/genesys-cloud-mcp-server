import type { AnalyticsApi, Models } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool, type ToolFactory } from "../utils/createTool.js";
import { errorResult } from "../utils/errorResult.js";
import { isUnauthorisedError } from "../utils/genesys/isUnauthorisedError.js";

export interface ToolDependencies {
  readonly analyticsApi: Pick<
    AnalyticsApi,
    "postAnalyticsConversationsDetailsQuery"
  >;
}

const paramsSchema = z
  .object({
    contactId: z
      .string()
      .uuid()
      .optional()
      .describe("One Genesys Cloud external contact UUID"),
    contactIds: z
      .array(z.string().uuid())
      .min(1)
      .max(100)
      .optional()
      .describe(
        "One to 100 Genesys Cloud external contact UUIDs. Use this for bulk lookups, including IDs extracted from a CSV column.",
      ),
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
  })
  .refine(
    ({ contactId, contactIds }) => Boolean(contactId) !== Boolean(contactIds),
    "Provide exactly one of contactId or contactIds",
  );

type ConversationMatch = {
  conversationId: string;
  participantId: string;
  conversationStart: string | null;
  attempt: number;
};

function contactIdsFor(contactId?: string, contactIds?: string[]): string[] {
  return [...new Set(contactIds ?? (contactId ? [contactId] : []))];
}

function matchesForContact(
  contactId: string,
  conversations: Models.AnalyticsConversationWithoutAttributes[],
): ConversationMatch[] {
  return conversations
    .flatMap((conversation) =>
      (conversation.participants ?? [])
        .filter(
          (participant) =>
            participant.externalContactId === contactId &&
            participant.participantId &&
            conversation.conversationId,
        )
        .map((participant) => ({
          conversationId: conversation.conversationId as string,
          participantId: participant.participantId as string,
          conversationStart: conversation.conversationStart ?? null,
          attempt: 0,
        })),
    )
    .sort(
      (a, b) =>
        (a.conversationStart ?? "").localeCompare(b.conversationStart ?? "") ||
        a.conversationId.localeCompare(b.conversationId),
    )
    .map((conversation, index) => ({ ...conversation, attempt: index + 1 }));
}

export const searchConversationsByContactId: ToolFactory<
  ToolDependencies,
  typeof paramsSchema
> = ({ analyticsApi }) =>
  createTool({
    schema: {
      name: "search_conversations_by_contact_id",
      annotations: { title: "Search Conversations by Contact ID" },
      description:
        "Finds conversations for one or more Genesys Cloud external contacts and returns each matching conversation ID, external participant ID, start time, and chronological attempt number. Requires analytics:conversationDetail:view.",
      paramsSchema,
    },
    call: async ({ contactId, contactIds, startDate, endDate }) => {
      const from = new Date(startDate);
      const to = new Date(endDate);
      if (Number.isNaN(from.getTime()))
        return errorResult("startDate is not a valid ISO-8601 date");
      if (Number.isNaN(to.getTime()))
        return errorResult("endDate is not a valid ISO-8601 date");
      if (from >= to) return errorResult("Start date must be before end date");
      if (to > new Date()) to.setTime(Date.now());

      const requestedContactIds = contactIdsFor(contactId, contactIds);
      const conversations: Models.AnalyticsConversationWithoutAttributes[] = [];

      try {
        for (let pageNumber = 1; ; pageNumber++) {
          const result =
            await analyticsApi.postAnalyticsConversationsDetailsQuery({
              order: "asc",
              orderBy: "conversationStart",
              paging: { pageSize: 100, pageNumber },
              interval: `${from.toISOString()}/${to.toISOString()}`,
              segmentFilters: [
                {
                  type: "or",
                  predicates: requestedContactIds.map((value) => ({
                    type: "dimension",
                    dimension: "externalContactId",
                    operator: "matches",
                    value,
                  })),
                },
              ],
              conversationFilters: [],
              evaluationFilters: [],
              surveyFilters: [],
            });
          const page = result.conversations ?? [];
          conversations.push(...page);
          if (
            page.length < 100 ||
            conversations.length >= (result.totalHits ?? 0)
          )
            break;
        }
      } catch (error: unknown) {
        return errorResult(
          isUnauthorisedError(error)
            ? "Failed to search conversations: Unauthorised access. Please check API credentials or permissions"
            : `Failed to search conversations: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      }

      const results = requestedContactIds.map((id) => {
        const matches = matchesForContact(id, conversations);
        return {
          contactId: id,
          latest: matches.at(-1) ?? null,
          conversations: matches,
        };
      });
      const response = contactId ? results[0] : { contacts: results };

      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
      };
    },
  });
