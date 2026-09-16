import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { getConversationJourney } from "./getConversationJourney.js";

describe("Get Conversation Journey Tool", () => {
  test("returns chronological segments and deterministic totals", async () => {
    const conversationId = randomUUID();
    const analyticsApi = {
      getAnalyticsConversationDetails: vi.fn().mockResolvedValue({
        conversationId,
        conversationStart: "2026-09-14T10:00:00.000Z",
        conversationEnd: "2026-09-14T10:05:00.000Z",
        originatingDirection: "inbound",
        participants: [
          {
            participantId: "agent-participant",
            participantName: "Agent One",
            purpose: "agent",
            userId: randomUUID(),
            sessions: [
              {
                sessionId: "agent-session",
                mediaType: "voice",
                metrics: [{ name: "nTransferred", value: 1 }],
                segments: [
                  {
                    segmentStart: "2026-09-14T10:03:00.000Z",
                    segmentEnd: "2026-09-14T10:05:00.000Z",
                    segmentType: "interact",
                    disconnectType: "client",
                  },
                ],
              },
            ],
          },
          {
            participantId: "customer-participant",
            purpose: "customer",
            sessions: [
              {
                sessionId: "customer-session",
                mediaType: "voice",
                addressFrom: "+622100000000",
                metrics: [{ name: "tQueue", value: 30_000 }],
                segments: [
                  {
                    segmentStart: "2026-09-14T10:00:00.000Z",
                    segmentEnd: "2026-09-14T10:02:00.000Z",
                    segmentType: "system",
                  },
                  {
                    segmentStart: "2026-09-14T10:02:00.000Z",
                    segmentEnd: "2026-09-14T10:03:00.000Z",
                    segmentType: "interact",
                    queueId: randomUUID(),
                  },
                ],
              },
              { sessionId: "empty-session" },
            ],
          },
        ],
      }),
    };

    const result = await getConversationJourney({ analyticsApi }).call({
      conversationId,
    });
    const content = result.content[0];
    if (content.type !== "text") throw new Error("Expected text result");
    const journey = JSON.parse(content.text);

    expect(analyticsApi.getAnalyticsConversationDetails).toHaveBeenCalledWith(
      conversationId,
    );
    expect(
      journey.segments.map(
        ({ segmentStart }: { segmentStart: string }) => segmentStart,
      ),
    ).toStrictEqual([
      "2026-09-14T10:00:00.000Z",
      "2026-09-14T10:02:00.000Z",
      "2026-09-14T10:03:00.000Z",
    ]);
    expect(journey.mediaTypes).toStrictEqual(["voice"]);
    expect(journey.transferCount).toBe(1);
    expect(journey.totalQueueWaitMs).toBe(30_000);
    expect(journey.participants[1].sessions).toHaveLength(2);
  });

  test("returns a clear authorization error", async () => {
    const analyticsApi = {
      getAnalyticsConversationDetails: vi.fn().mockRejectedValue({
        code: "not.authorized",
        status: 403,
      }),
    };

    const result = await getConversationJourney({ analyticsApi }).call({
      conversationId: randomUUID(),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Unauthorised access"),
    });
  });
});
