import type { Models, WebDeploymentsApi } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool } from "../utils/createTool.js";

export interface ToolDependencies {
  readonly webDeploymentsApi: Pick<
    WebDeploymentsApi,
    | "getWebdeploymentsDeployments"
    | "getWebdeploymentsDeployment"
    | "getWebdeploymentsDeploymentConfigurations"
    | "postWebdeploymentsDeployments"
    | "putWebdeploymentsDeployment"
  >;
}

const entityRef = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    selfUri: z.string().optional(),
  })
  .passthrough();

const configuration = entityRef.extend({ version: z.string().min(1) });
const flow = entityRef.extend({
  flowDescription: z.string().optional(),
  publishVersion: z.object({}).passthrough().optional(),
});
const supportedContent = entityRef.extend({
  mediaTypes: z.object({}).passthrough().optional(),
});
const deploymentFields = {
  name: z.string().min(1),
  description: z.string().optional(),
  allowAllDomains: z.boolean().optional(),
  allowedDomains: z.array(z.string()).optional(),
  supportedContent: supportedContent.optional(),
  flow: flow.optional(),
  status: z.string().optional(),
  pushIntegrations: z
    .array(
      z
        .object({
          id: z.string().optional(),
          provider: z.string().optional(),
        })
        .passthrough(),
    )
    .optional(),
  configuration,
};
const deployment = z.object(deploymentFields).passthrough();
const changes = z
  .object({
    ...deploymentFields,
    name: deploymentFields.name.optional(),
    configuration: configuration.partial().optional(),
    flow: flow.partial().optional(),
    supportedContent: supportedContent.partial().optional(),
  })
  .passthrough();
const deploymentId = z.string().min(1).describe("Genesys Cloud deployment ID");
const expand = z
  .array(z.string())
  .optional()
  .describe("Entity attributes to expand");

function success(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function failure(action: string, error: unknown) {
  const details =
    error instanceof Error
      ? { ...error, name: error.name, message: error.message }
      : error;
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          errorMessage: `Failed to ${action}`,
          error: details,
        }),
      },
    ],
  };
}

// Merge objects so a partial PUT does not discard fields returned by Genesys.
// Arrays and scalar values replace the existing value; an empty array clears a list.
function mergeObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const previous = Object.hasOwn(base, key) ? base[key] : undefined;
    const merged =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      previous !== null &&
      typeof previous === "object" &&
      !Array.isArray(previous)
        ? mergeObjects(
            previous as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value;
    Object.defineProperty(result, key, {
      value: merged,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

export function messengerDeploymentTools({
  webDeploymentsApi,
}: ToolDependencies) {
  return [
    createTool({
      schema: {
        name: "list_messenger_deployments",
        description:
          "List Messenger deployments using Genesys cursor pagination. The response includes pagination links and cursors.",
        annotations: { title: "List Messenger Deployments" },
        paramsSchema: z.object({
          pageSize: z
            .string()
            .optional()
            .describe("Number of deployments per page (Genesys default 300)"),
          before: z
            .string()
            .optional()
            .describe("Cursor before the current page"),
          after: z
            .string()
            .optional()
            .describe("Cursor after the current page"),
          expand,
        }),
      },
      call: async (params) => {
        try {
          return success(
            await webDeploymentsApi.getWebdeploymentsDeployments(params),
          );
        } catch (error) {
          return failure("list Messenger deployments", error);
        }
      },
    }),
    createTool({
      schema: {
        name: "get_messenger_deployment",
        description:
          "Get a Messenger deployment, including its configuration reference.",
        annotations: { title: "Get Messenger Deployment" },
        paramsSchema: z.object({ deploymentId, expand }),
      },
      call: async ({ deploymentId, expand }) => {
        try {
          return success(
            await webDeploymentsApi.getWebdeploymentsDeployment(deploymentId, {
              expand,
            }),
          );
        } catch (error) {
          return failure("get Messenger deployment", error);
        }
      },
    }),
    createTool({
      schema: {
        name: "get_messenger_deployment_active_configuration",
        description:
          "Inspect the active configuration and deployment returned by Genesys for a Messenger deployment.",
        annotations: { title: "Get Active Messenger Deployment Configuration" },
        paramsSchema: z.object({
          deploymentId,
          type: z
            .string()
            .optional()
            .describe("Genesys active configuration type filter"),
          expand,
        }),
      },
      call: async ({ deploymentId, type, expand }) => {
        try {
          return success(
            await webDeploymentsApi.getWebdeploymentsDeploymentConfigurations(
              deploymentId,
              { type, expand },
            ),
          );
        } catch (error) {
          return failure(
            "get active Messenger deployment configuration",
            error,
          );
        }
      },
    }),
    createTool({
      schema: {
        name: "create_messenger_deployment",
        description:
          "Create a Messenger deployment with a configuration ID and version. Additional Genesys deployment fields are passed through.",
        annotations: {
          title: "Create Messenger Deployment",
          readOnlyHint: false,
          idempotentHint: false,
        },
        paramsSchema: z.object({ deployment }),
      },
      call: async ({ deployment }) => {
        try {
          return success(
            await webDeploymentsApi.postWebdeploymentsDeployments(deployment),
          );
        } catch (error) {
          return failure("create Messenger deployment", error);
        }
      },
    }),
    createTool({
      schema: {
        name: "update_messenger_deployment",
        description:
          "Update a Messenger deployment. Reads the current deployment and merges changes into it before PUT; nested objects merge, while arrays replace existing arrays. Concurrent changes after the read can be overwritten.",
        annotations: {
          title: "Update Messenger Deployment",
          readOnlyHint: false,
          destructiveHint: true,
        },
        paramsSchema: z.object({ deploymentId, changes }),
      },
      call: async ({ deploymentId, changes }) => {
        try {
          const current =
            await webDeploymentsApi.getWebdeploymentsDeployment(deploymentId);
          const updated = mergeObjects(
            current as unknown as Record<string, unknown>,
            changes,
          ) as unknown as Models.WebDeployment;
          return success(
            await webDeploymentsApi.putWebdeploymentsDeployment(
              deploymentId,
              updated,
            ),
          );
        } catch (error) {
          return failure("update Messenger deployment", error);
        }
      },
    }),
  ];
}
