import type { Models, WebDeploymentsApi } from "purecloud-platform-client-v2";
import { z } from "zod";
import { createTool } from "../utils/createTool.js";

export interface ToolDependencies {
  readonly webDeploymentsApi: Pick<
    WebDeploymentsApi,
    | "getWebdeploymentsConfigurations"
    | "getWebdeploymentsConfigurationVersionsDraft"
    | "getWebdeploymentsConfigurationVersions"
    | "getWebdeploymentsConfigurationVersion"
    | "postWebdeploymentsConfigurations"
    | "putWebdeploymentsConfigurationVersionsDraft"
    | "postWebdeploymentsConfigurationVersionsDraftPublish"
  >;
}

const configurationId = z
  .string()
  .min(1)
  .describe("Genesys Cloud Messenger configuration ID");
const pagination = {
  pageSize: z
    .string()
    .optional()
    .describe(
      "Maximum entities per page, as a string; Genesys defaults to 300",
    ),
  before: z.string().optional().describe("Cursor for the preceding page"),
  after: z.string().optional().describe("Cursor for the following page"),
};

// Preserve unknown fields at every level so a draft can be round-tripped as the
// complete PUT body, including settings added by newer Genesys API versions.
const settings = z.looseObject({});
const configuration = z
  .looseObject({
    name: z.string().min(1).describe("Configuration name"),
    description: z.string().optional(),
    languages: z.array(z.string()).optional(),
    defaultLanguage: z.string().optional(),
    customI18nLabels: z
      .array(settings)
      .optional()
      .describe("Localized Messenger labels"),
    headlessMode: settings.optional(),
    messenger: settings
      .optional()
      .describe("Messenger appearance, launcher, apps and messaging settings"),
    position: settings.optional().describe("Messenger alignment and spacing"),
    supportCenter: settings.optional().describe("Knowledge portal settings"),
    cobrowse: settings.optional().describe("Co-browse and privacy settings"),
    journeyEvents: settings.optional().describe("Digital tracking settings"),
    authenticationSettings: settings.optional(),
    video: settings.optional(),
  })
  .describe(
    "Complete Genesys WebDeploymentConfigurationVersion object; all additional fields are passed through",
  );

async function result(operation: () => Promise<unknown>) {
  try {
    const response = await operation();
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(response ?? null) },
      ],
    };
  } catch (error: unknown) {
    const details =
      error instanceof Error
        ? { ...error, name: error.name, message: error.message }
        : error;
    return {
      isError: true,
      content: [
        { type: "text" as const, text: JSON.stringify({ error: details }) },
      ],
    };
  }
}

export function messengerConfigurationTools({
  webDeploymentsApi,
}: ToolDependencies) {
  return [
    createTool({
      schema: {
        name: "list_messenger_configurations",
        annotations: { title: "List Messenger Configurations" },
        description:
          "List Messenger configuration drafts with cursor pagination. The response includes Genesys pagination links and metadata.",
        paramsSchema: z.object({
          ...pagination,
          showOnlyPublished: z
            .boolean()
            .optional()
            .describe("Filter by published status"),
        }),
      },
      call: async (params) =>
        result(() => webDeploymentsApi.getWebdeploymentsConfigurations(params)),
    }),
    createTool({
      schema: {
        name: "get_messenger_configuration_draft",
        annotations: { title: "Get Messenger Configuration Draft" },
        description: "Get the complete draft of a Messenger configuration.",
        paramsSchema: z.object({ configurationId }),
      },
      call: async ({ configurationId }) =>
        result(() =>
          webDeploymentsApi.getWebdeploymentsConfigurationVersionsDraft(
            configurationId,
          ),
        ),
    }),
    createTool({
      schema: {
        name: "list_messenger_configuration_versions",
        annotations: { title: "List Messenger Configuration Versions" },
        description:
          "List versions of a Messenger configuration with cursor pagination. The response includes Genesys pagination links and metadata.",
        paramsSchema: z.object({ configurationId, ...pagination }),
      },
      call: async ({ configurationId, ...params }) =>
        result(() =>
          webDeploymentsApi.getWebdeploymentsConfigurationVersions(
            configurationId,
            params,
          ),
        ),
    }),
    createTool({
      schema: {
        name: "get_messenger_configuration_version",
        annotations: { title: "Get Messenger Configuration Version" },
        description: "Get a specific Messenger configuration version.",
        paramsSchema: z.object({
          configurationId,
          versionId: z
            .string()
            .min(1)
            .describe("Published configuration version ID"),
        }),
      },
      call: async ({ configurationId, versionId }) =>
        result(() =>
          webDeploymentsApi.getWebdeploymentsConfigurationVersion(
            configurationId,
            versionId,
          ),
        ),
    }),
    createTool({
      schema: {
        name: "create_messenger_configuration",
        annotations: {
          title: "Create Messenger Configuration Draft",
          readOnlyHint: false,
          idempotentHint: false,
        },
        description:
          "Create a Messenger configuration draft from a Genesys configuration object. This does not publish it.",
        paramsSchema: z.object({ configuration }),
      },
      call: async ({ configuration }) =>
        result(() =>
          webDeploymentsApi.postWebdeploymentsConfigurations(
            configuration as Models.WebDeploymentConfigurationVersion,
          ),
        ),
    }),
    createTool({
      schema: {
        name: "update_messenger_configuration_draft",
        annotations: {
          title: "Update Messenger Configuration Draft",
          readOnlyHint: false,
          destructiveHint: true,
        },
        description:
          "Replace the complete Messenger configuration draft using PUT. This is not a partial update: first get the draft, modify the complete object, and supply it as configuration to avoid losing omitted settings. This does not publish it.",
        paramsSchema: z.object({ configurationId, configuration }),
      },
      call: async ({ configurationId, configuration }) =>
        result(() =>
          webDeploymentsApi.putWebdeploymentsConfigurationVersionsDraft(
            configurationId,
            configuration as Models.WebDeploymentConfigurationVersion,
          ),
        ),
    }),
    createTool({
      schema: {
        name: "publish_messenger_configuration",
        annotations: {
          title: "Publish Messenger Configuration Draft",
          readOnlyHint: false,
          idempotentHint: false,
        },
        description:
          "Publish the current Messenger configuration draft, creating a new published version.",
        paramsSchema: z.object({ configurationId }),
      },
      call: async ({ configurationId }) =>
        result(() =>
          webDeploymentsApi.postWebdeploymentsConfigurationVersionsDraftPublish(
            configurationId,
          ),
        ),
    }),
  ];
}
