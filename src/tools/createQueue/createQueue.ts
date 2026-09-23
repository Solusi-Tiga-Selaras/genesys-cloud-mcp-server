import type { Models, RoutingApi } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool, type ToolFactory } from "../utils/createTool.js";
import { errorResult } from "../utils/errorResult.js";
import { isUnauthorisedError } from "../utils/genesys/isUnauthorisedError.js";

export interface ToolDependencies {
  readonly routingApi: Pick<
    RoutingApi,
    "getRoutingQueues" | "postRoutingQueues"
  >;
}

const paramsSchema = z.object({
  name: z.string().trim().min(1).describe("Unique name for the queue"),
  description: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional queue description"),
  divisionId: z
    .string()
    .uuid()
    .optional()
    .describe("Optional division UUID. Uses the default division when omitted"),
});

export const createQueue: ToolFactory<
  ToolDependencies,
  typeof paramsSchema
> = ({ routingApi }) =>
  createTool({
    schema: {
      name: "create_queue",
      annotations: {
        title: "Create Queue",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        "Creates a Genesys Cloud routing queue. First checks for an existing queue with the same name. Requires routing:queue:add and routing:queue:view permissions, and GENESYSCLOUD_ENABLE_QUEUE_CREATION=true.",
      paramsSchema,
    },
    call: async ({ name, description, divisionId }) => {
      try {
        const queues = await routingApi.getRoutingQueues({
          name,
          pageNumber: 1,
          pageSize: 100,
        });
        const existingQueue = (queues.entities ?? []).find(
          (queue) => queue.name?.toLowerCase() === name.toLowerCase(),
        );

        if (existingQueue) {
          return errorResult(
            `Queue "${name}" already exists${existingQueue.id ? ` (id: ${existingQueue.id})` : ""}.`,
          );
        }
      } catch (error: unknown) {
        return errorResult(
          isUnauthorisedError(error)
            ? "Failed to check for an existing queue: Unauthorised access. Please check API credentials or permissions."
            : `Failed to check for an existing queue: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      }

      const queue: Models.CreateQueueRequest = {
        name,
        ...(description ? { description } : {}),
        ...(divisionId ? { division: { id: divisionId } } : {}),
      };

      try {
        const createdQueue = await routingApi.postRoutingQueues(queue);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: createdQueue.id,
                name: createdQueue.name,
                ...(createdQueue.description
                  ? { description: createdQueue.description }
                  : {}),
                ...(createdQueue.division?.id
                  ? { divisionId: createdQueue.division.id }
                  : {}),
              }),
            },
          ],
        };
      } catch (error: unknown) {
        return errorResult(
          isUnauthorisedError(error)
            ? "Failed to create queue: Unauthorised access. Please check API credentials or permissions."
            : `Failed to create queue: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      }
    },
  });
