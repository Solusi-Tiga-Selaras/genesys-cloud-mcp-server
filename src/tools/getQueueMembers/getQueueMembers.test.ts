import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { getQueueMembers } from "./getQueueMembers.js";

describe("Get Queue Members Tool", () => {
  test("returns members with joined, presence, routing status, skills, and languages", async () => {
    const queueId = randomUUID();
    const memberId = randomUUID();
    const secondMemberId = randomUUID();
    const routingApi = {
      getRoutingQueueMembers: vi.fn().mockResolvedValue({
        entities: [
          {
            id: memberId,
            name: "Ada Lovelace",
            joined: true,
            routingStatus: { userId: memberId, status: "IDLE" },
            user: {
              id: memberId,
              name: "Ada Lovelace",
              presence: {
                name: "Available",
                presenceDefinition: { systemPresence: "Available" },
              },
              skills: [
                { id: "1", name: "Billing", proficiency: 5 },
                { id: "2", proficiency: 3 },
              ],
              languages: [{ id: "3", name: "English", proficiency: 5 }],
            },
          },
          {
            id: secondMemberId,
            name: "Grace Hopper",
            joined: false,
            routingStatus: { status: "OFF_QUEUE" },
          },
        ],
        pageNumber: 1,
        pageSize: 100,
        nextUri: "/api/v2/routing/queues/abc/members?pageNumber=2",
      }),
    };

    const result = await getQueueMembers({ routingApi }).call({ queueId });

    expect(routingApi.getRoutingQueueMembers).toHaveBeenCalledWith(queueId, {
      pageNumber: 1,
      pageSize: 100,
      expand: ["skills", "languages", "presence"],
    });

    const content = result.content[0];
    if (content.type !== "text") throw new Error("Expected text result");
    const response = JSON.parse(content.text);

    expect(response).toStrictEqual({
      queueId,
      members: [
        {
          userId: memberId,
          name: "Ada Lovelace",
          joined: true,
          routingStatus: "IDLE",
          presence: "Available",
          skills: ["Billing"],
          languages: ["English"],
        },
        {
          userId: secondMemberId,
          name: "Grace Hopper",
          joined: false,
          routingStatus: "OFF_QUEUE",
          presence: null,
        },
      ],
      pagination: {
        pageNumber: 1,
        pageSize: 100,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });
    expect(response.members[1].skills).toBeUndefined();
    expect(response.members[1].languages).toBeUndefined();
  });

  test("maps filters directly to the routing API options", async () => {
    const queueId = randomUUID();
    const routingApi = {
      getRoutingQueueMembers: vi.fn().mockResolvedValue({ entities: [] }),
    };

    await getQueueMembers({ routingApi }).call({
      queueId,
      name: "Ada",
      joined: true,
      presence: ["Available"],
      routingStatus: ["IDLE", "INTERACTING"],
      pageNumber: 2,
      pageSize: 25,
    });

    expect(routingApi.getRoutingQueueMembers).toHaveBeenCalledWith(queueId, {
      pageNumber: 2,
      pageSize: 25,
      expand: ["skills", "languages", "presence"],
      name: "Ada",
      joined: true,
      presence: ["Available"],
      routingStatus: ["IDLE", "INTERACTING"],
    });
  });

  test("returns a clear missing-permission error", async () => {
    const routingApi = {
      getRoutingQueueMembers: vi.fn().mockRejectedValue({
        code: "missing.any.permissions",
        status: 403,
      }),
    };

    const result = await getQueueMembers({ routingApi }).call({
      queueId: randomUUID(),
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: "text",
          text: expect.stringContaining("routing:queue:view"),
        },
      ],
    });
  });
});
