import type { Models, RoutingApi } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool, type ToolFactory } from "../utils/createTool.js";
import { errorResult } from "../utils/errorResult.js";
import { isMissingPermissionsError } from "../utils/genesys/isMissingPermissionsError.js";
import { isUnauthorisedError } from "../utils/genesys/isUnauthorisedError.js";

export interface ToolDependencies {
  readonly routingApi: Pick<RoutingApi, "getRoutingQueueMembers">;
}

const routingStatusSchema = z.enum([
  "OFF_QUEUE",
  "IDLE",
  "INTERACTING",
  "NOT_RESPONDING",
  "COMMUNICATING",
]);

const paramsSchema = z.object({
  queueId: z.string().uuid().describe("The UUID of the routing queue"),
  name: z
    .string()
    .min(1)
    .optional()
    .describe("Optional filter on the member name"),
  joined: z
    .boolean()
    .optional()
    .describe("Optional filter on whether the member has joined the queue"),
  presence: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe("Optional filter on one or more presence names"),
  routingStatus: z
    .array(routingStatusSchema)
    .min(1)
    .optional()
    .describe("Optional filter on one or more routing statuses"),
  pageNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Page number to retrieve, starting from 1. Defaults to 1"),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Members per page. Defaults to 100. The maximum value is 100"),
});

function skillNames(
  values: Models.UserRoutingSkill[] | undefined,
): string[] | undefined {
  if (!values) return undefined;
  return values
    .map((value) => value.name)
    .filter((name): name is string => Boolean(name));
}

function languageNames(
  values: Models.UserRoutingLanguage[] | undefined,
): string[] | undefined {
  if (!values) return undefined;
  return values
    .map((value) => value.name)
    .filter((name): name is string => Boolean(name));
}

function formatMember(member: Models.QueueMember) {
  const user = member.user;
  const presence = user?.presence;
  const skills = skillNames(user?.skills);
  const languages = languageNames(user?.languages);

  return {
    userId: user?.id ?? member.id ?? null,
    name: member.name ?? user?.name ?? null,
    joined: member.joined ?? null,
    routingStatus: member.routingStatus?.status ?? null,
    presence:
      presence?.presenceDefinition?.systemPresence ?? presence?.name ?? null,
    ...(skills ? { skills } : {}),
    ...(languages ? { languages } : {}),
  };
}

export const getQueueMembers: ToolFactory<
  ToolDependencies,
  typeof paramsSchema
> = ({ routingApi }) =>
  createTool({
    schema: {
      name: "get_queue_members",
      annotations: { title: "Get Queue Members" },
      description:
        "Returns the members of a routing queue with their joined state, routing status, presence, skills, and languages when returned by Genesys Cloud. Joined, routing status, and presence are separate fields; presence alone does not imply that a member can receive interactions. Requires routing:queue:view.",
      paramsSchema,
    },
    call: async ({
      queueId,
      name,
      joined,
      presence,
      routingStatus,
      pageNumber = 1,
      pageSize = 100,
    }) => {
      let result: Models.QueueMemberEntityListing;
      try {
        result = await routingApi.getRoutingQueueMembers(queueId, {
          pageNumber,
          pageSize,
          expand: ["skills", "languages", "presence"],
          ...(name ? { name } : {}),
          ...(joined !== undefined ? { joined } : {}),
          ...(presence ? { presence } : {}),
          ...(routingStatus ? { routingStatus } : {}),
        });
      } catch (error: unknown) {
        const unauthorized =
          isUnauthorisedError(error) || isMissingPermissionsError(error);
        return errorResult(
          unauthorized
            ? "Failed to retrieve queue members: Unauthorised access. Please check API credentials or routing:queue:view permission"
            : `Failed to retrieve queue members: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              queueId,
              members: (result.entities ?? []).map(formatMember),
              pagination: {
                pageNumber: result.pageNumber ?? pageNumber,
                pageSize: result.pageSize ?? pageSize,
                hasNextPage: Boolean(result.nextUri),
                hasPreviousPage: Boolean(result.previousUri),
              },
            }),
          },
        ],
      };
    },
  });
