import { randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { createQueue } from "./createQueue.js";

describe("Create Queue Tool", () => {
  test("does not duplicate an existing queue", async () => {
    const queueId = randomUUID();
    const routingApi = {
      getRoutingQueues: vi.fn().mockResolvedValue({
        entities: [{ id: queueId, name: "Support" }],
      }),
      postRoutingQueues: vi.fn(),
    };

    const result = await createQueue({ routingApi }).call({
      name: "support",
    });

    expect(result.isError).toBe(true);
    expect(routingApi.postRoutingQueues).not.toHaveBeenCalled();
  });

  test("creates a queue after checking its name", async () => {
    const queueId = randomUUID();
    const divisionId = randomUUID();
    const routingApi = {
      getRoutingQueues: vi.fn().mockResolvedValue({ entities: [] }),
      postRoutingQueues: vi.fn().mockResolvedValue({
        id: queueId,
        name: "Support",
        description: "Customer support",
        division: { id: divisionId },
      }),
    };

    const result = await createQueue({ routingApi }).call({
      name: "Support",
      description: "Customer support",
      divisionId,
    });

    expect(routingApi.getRoutingQueues).toHaveBeenCalledWith({
      name: "Support",
      pageNumber: 1,
      pageSize: 100,
    });
    expect(routingApi.postRoutingQueues).toHaveBeenCalledWith({
      name: "Support",
      description: "Customer support",
      division: { id: divisionId },
    });
    expect(result).toStrictEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            id: queueId,
            name: "Support",
            description: "Customer support",
            divisionId,
          }),
        },
      ],
    });
  });
});
