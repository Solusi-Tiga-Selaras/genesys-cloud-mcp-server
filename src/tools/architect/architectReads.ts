import type { ArchitectApi } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool } from "../utils/createTool.js";

export interface ArchitectReadDependencies {
  readonly architectApi: Pick<ArchitectApi, "getFlows" | "getFlow">;
}

function success(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function failure(action: string, error: unknown) {
  const details =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : undefined;
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          errorMessage: `Failed to ${action}`,
          error: {
            message:
              error instanceof Error
                ? error.message
                : typeof error === "string"
                  ? error
                  : undefined,
            status: details?.status,
            code: details?.code,
          },
        }),
      },
    ],
  };
}

export function architectReadTools({
  architectApi,
}: ArchitectReadDependencies) {
  return [
    createTool({
      schema: {
        name: "list_architect_flows",
        description:
          "List Architect flows with optional filters and page-number pagination. The response includes Genesys pagination metadata. When IDs are supplied Genesys ignores other filters.",
        annotations: { title: "List Architect Flows" },
        paramsSchema: z.object({
          pageNumber: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Page number, starting at 1 (Genesys default 1)"),
          pageSize: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Results per page (Genesys default 25)"),
          type: z
            .array(z.string())
            .optional()
            .describe("Flow types, including inbound and outbound types"),
          id: z
            .array(z.string())
            .optional()
            .describe(
              "Flow IDs; Genesys ignores other filters when IDs are supplied",
            ),
          name: z.string().optional(),
          description: z.string().optional(),
          nameOrDescription: z.string().optional(),
          publishVersionId: z.string().optional(),
          editableBy: z.string().optional(),
          lockedBy: z.string().optional(),
          lockedByClientId: z.string().optional(),
          secure: z.string().optional(),
          deleted: z.boolean().optional().describe("Include deleted flows"),
          includeSchemas: z.boolean().optional(),
          virtualAgentEnabled: z.boolean().optional(),
          publishedAfter: z.string().optional(),
          publishedBefore: z.string().optional(),
          divisionId: z.array(z.string()).optional(),
          sortBy: z.string().optional(),
          sortOrder: z.string().optional(),
        }),
      },
      call: async (params) => {
        try {
          return success(await architectApi.getFlows(params));
        } catch (error) {
          return failure("list Architect flows", error);
        }
      },
    }),
    createTool({
      schema: {
        name: "get_architect_flow",
        description:
          "Get an Architect flow by ID, optionally including a deleted flow.",
        annotations: { title: "Get Architect Flow" },
        paramsSchema: z.object({
          flowId: z.string().min(1).describe("Genesys Cloud flow ID"),
          deleted: z.boolean().optional().describe("Include a deleted flow"),
        }),
      },
      call: async ({ flowId, deleted }) => {
        try {
          return success(await architectApi.getFlow(flowId, { deleted }));
        } catch (error) {
          return failure("get Architect flow", error);
        }
      },
    }),
  ];
}
