import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import {
  searchConversationsByContactId,
  type ToolDependencies,
} from "./searchConversationsByContactId.js";

const startDate = "2024-01-01T00:00:00Z";
const endDate = "2024-01-02T00:00:00Z";

function resultText(result: {
  content: Array<{ type: string; text?: string }>;
}) {
  const content = result.content[0];
  if (content?.type !== "text" || !content.text)
    throw new Error("Expected text content");
  return JSON.parse(content.text);
}

describe("Search Conversations by Contact ID Tool", () => {
  test("returns the external participant and chronological attempts", async () => {
    const contactId = randomUUID();
    const conversationOne = randomUUID();
    const conversationTwo = randomUUID();
    const analyticsApi: ToolDependencies["analyticsApi"] = {
      postAnalyticsConversationsDetailsQuery: vi.fn().mockResolvedValue({
        totalHits: 2,
        conversations: [
          {
            conversationId: conversationTwo,
            conversationStart: "2024-01-01T11:00:00.000Z",
            participants: [
              {
                externalContactId: contactId,
                participantId: "participant-two",
              },
            ],
          },
          {
            conversationId: conversationOne,
            conversationStart: "2024-01-01T10:00:00.000Z",
            participants: [
              {
                externalContactId: contactId,
                participantId: "participant-one",
              },
            ],
          },
        ],
      }),
    };
    const tool = searchConversationsByContactId({ analyticsApi });

    const result = await tool.call({ contactId, startDate, endDate });

    expect(
      analyticsApi.postAnalyticsConversationsDetailsQuery,
    ).toHaveBeenCalledWith({
      order: "asc",
      orderBy: "conversationStart",
      paging: { pageSize: 100, pageNumber: 1 },
      interval: "2024-01-01T00:00:00.000Z/2024-01-02T00:00:00.000Z",
      segmentFilters: [
        {
          type: "or",
          predicates: [
            {
              type: "dimension",
              dimension: "externalContactId",
              operator: "matches",
              value: contactId,
            },
          ],
        },
      ],
      conversationFilters: [],
      evaluationFilters: [],
      surveyFilters: [],
    });
    expect(resultText(result)).toStrictEqual({
      contactId,
      latest: {
        conversationId: conversationTwo,
        participantId: "participant-two",
        conversationStart: "2024-01-01T11:00:00.000Z",
        attempt: 2,
      },
      conversations: [
        {
          conversationId: conversationOne,
          participantId: "participant-one",
          conversationStart: "2024-01-01T10:00:00.000Z",
          attempt: 1,
        },
        {
          conversationId: conversationTwo,
          participantId: "participant-two",
          conversationStart: "2024-01-01T11:00:00.000Z",
          attempt: 2,
        },
      ],
    });
  });

  test("groups bulk contact IDs without adding extra API calls", async () => {
    const firstContactId = randomUUID();
    const secondContactId = randomUUID();
    const analyticsApi: ToolDependencies["analyticsApi"] = {
      postAnalyticsConversationsDetailsQuery: vi.fn().mockResolvedValue({
        totalHits: 1,
        conversations: [
          {
            conversationId: randomUUID(),
            conversationStart: "2024-01-01T10:00:00.000Z",
            participants: [
              {
                externalContactId: firstContactId,
                participantId: "first-participant",
              },
              {
                externalContactId: secondContactId,
                participantId: "second-participant",
              },
            ],
          },
        ],
      }),
    };
    const tool = searchConversationsByContactId({ analyticsApi });

    const result = await tool.call({
      contactIds: [firstContactId, secondContactId],
      startDate,
      endDate,
    });

    expect(
      analyticsApi.postAnalyticsConversationsDetailsQuery,
    ).toHaveBeenCalledTimes(1);
    expect(resultText(result)).toMatchObject({
      contacts: [
        {
          contactId: firstContactId,
          conversations: [{ participantId: "first-participant", attempt: 1 }],
        },
        {
          contactId: secondContactId,
          conversations: [{ participantId: "second-participant", attempt: 1 }],
        },
      ],
    });
  });
});
