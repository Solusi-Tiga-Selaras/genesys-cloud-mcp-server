import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LRUCache } from "lru-cache";
import platformClient, {
  type ApiClientClass,
} from "purecloud-platform-client-v2";
import { OAuthClientCredentialsWrapper } from "./auth/OAuthClientCredentialsWrapper.js";
import {
  type ConfigRetriever,
  createConfigRetriever,
} from "./createConfigRetriever.js";
import { conversationSentiment } from "./tools/conversationSentiment/conversationSentiment.js";
import { conversationTopics } from "./tools/conversationTopics/conversationTopics.js";
import { conversationTranscription } from "./tools/conversationTranscription/conversationTranscription.js";
import { createQueue } from "./tools/createQueue/createQueue.js";
import { getConversationJourney } from "./tools/getConversationJourney/getConversationJourney.js";
import { getQueueHealth } from "./tools/getQueueHealth/getQueueHealth.js";
import { getQueueMembers } from "./tools/getQueueMembers/getQueueMembers.js";
import { getQueuePerformance } from "./tools/getQueuePerformance/getQueuePerformance.js";
import { oauthClients } from "./tools/oauthClients/oauthClients.js";
import {
  type OAuthClientUsageResponse,
  oauthClientUsage,
} from "./tools/oauthClientUsage/oauthClientUsage.js";
import { queryQueueVolumes } from "./tools/queryQueueVolumes/queryQueueVolumes.js";
import { sampleConversationsByQueue } from "./tools/sampleConversationsByQueue/sampleConversationsByQueue.js";
import { searchConversationsByContactId } from "./tools/searchConversationsByContactId/searchConversationsByContactId.js";
import { searchGenesysCloudDeveloperForum } from "./tools/searchGenesysCloudDeveloperForum/searchGenesysCloudDeveloperForum.js";
import { searchGenesysCloudDocs } from "./tools/searchGenesysCloudDocs/searchGenesysCloudDocs.js";
import { searchQueues } from "./tools/searchQueues/searchQueues.js";
import { searchVoiceConversations } from "./tools/searchVoiceConversations/searchVoiceConversations.js";
import { voiceCallQuality } from "./tools/voiceCallQuality/voiceCallQuality.js";

export type McpServerFactory = () => McpServer;

export function createMcpServerFactory(
  configRetriever: ConfigRetriever = createConfigRetriever(process.env),
): McpServerFactory {
  // The SDK's ApiClientClass constructor is missing from its declarations.
  const { ApiClientClass: ApiClient } = platformClient as unknown as {
    ApiClientClass: new () => ApiClientClass;
  };
  const apiClient = new ApiClient();
  const withAuth = OAuthClientCredentialsWrapper(configRetriever, apiClient);
  const cache = new LRUCache<string, OAuthClientUsageResponse>({
    max: 500,
    ttl: 1000 * 60 * 5,
    allowStale: false,
    updateAgeOnGet: false,
    updateAgeOnHas: false,
  });

  const routingApi = new platformClient.RoutingApi(apiClient);
  const analyticsApi = new platformClient.AnalyticsApi(apiClient);
  const speechTextAnalyticsApi = new platformClient.SpeechTextAnalyticsApi(
    apiClient,
  );
  const recordingApi = new platformClient.RecordingApi(apiClient);
  const oauthApi = new platformClient.OAuthApi(apiClient);
  const authorizationApi = new platformClient.AuthorizationApi(apiClient);

  return () => {
    const server = new McpServer({
      name: "Solutif Genesys Cloud",
      version: "0.2.0", // Same version as version in package.json
    });

    const searchGenesysCloudDocsTool = searchGenesysCloudDocs({
      fetchUrl: fetch,
    });
    server.registerTool(
      searchGenesysCloudDocsTool.schema.name,
      {
        description: searchGenesysCloudDocsTool.schema.description,
        inputSchema: searchGenesysCloudDocsTool.schema.paramsSchema.shape,
        annotations: searchGenesysCloudDocsTool.schema.annotations,
      },
      searchGenesysCloudDocsTool.call,
    );

    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY?.trim();
    if (firecrawlApiKey) {
      const searchDeveloperForumTool = searchGenesysCloudDeveloperForum({
        apiKey: firecrawlApiKey,
        fetchUrl: fetch,
      });
      server.registerTool(
        searchDeveloperForumTool.schema.name,
        {
          description: searchDeveloperForumTool.schema.description,
          inputSchema: searchDeveloperForumTool.schema.paramsSchema.shape,
          annotations: searchDeveloperForumTool.schema.annotations,
        },
        searchDeveloperForumTool.call,
      );
    }

    const getConversationJourneyTool = getConversationJourney({ analyticsApi });
    server.registerTool(
      getConversationJourneyTool.schema.name,
      {
        description: getConversationJourneyTool.schema.description,
        inputSchema: getConversationJourneyTool.schema.paramsSchema.shape,
        annotations: getConversationJourneyTool.schema.annotations,
      },
      withAuth(getConversationJourneyTool.call),
    );

    if (process.env.GENESYSCLOUD_ENABLE_QUEUE_CREATION === "true") {
      const createQueueTool = createQueue({ routingApi });
      server.registerTool(
        createQueueTool.schema.name,
        {
          description: createQueueTool.schema.description,
          inputSchema: createQueueTool.schema.paramsSchema.shape,
          annotations: createQueueTool.schema.annotations,
        },
        withAuth(createQueueTool.call),
      );
    }

    const searchQueuesTool = searchQueues({ routingApi });
    server.registerTool(
      searchQueuesTool.schema.name,
      {
        description: searchQueuesTool.schema.description,
        inputSchema: searchQueuesTool.schema.paramsSchema.shape,
        annotations: searchQueuesTool.schema.annotations,
      },
      withAuth(searchQueuesTool.call),
    );

    const getQueueHealthTool = getQueueHealth({ analyticsApi });
    server.registerTool(
      getQueueHealthTool.schema.name,
      {
        description: getQueueHealthTool.schema.description,
        inputSchema: getQueueHealthTool.schema.paramsSchema.shape,
        annotations: getQueueHealthTool.schema.annotations,
      },
      withAuth(getQueueHealthTool.call),
    );

    const getQueuePerformanceTool = getQueuePerformance({ analyticsApi });
    server.registerTool(
      getQueuePerformanceTool.schema.name,
      {
        description: getQueuePerformanceTool.schema.description,
        inputSchema: getQueuePerformanceTool.schema.paramsSchema.shape,
        annotations: getQueuePerformanceTool.schema.annotations,
      },
      withAuth(getQueuePerformanceTool.call),
    );

    const getQueueMembersTool = getQueueMembers({ routingApi });
    server.registerTool(
      getQueueMembersTool.schema.name,
      {
        description: getQueueMembersTool.schema.description,
        inputSchema: getQueueMembersTool.schema.paramsSchema.shape,
        annotations: getQueueMembersTool.schema.annotations,
      },
      withAuth(getQueueMembersTool.call),
    );

    const sampleConversationsByQueueTool = sampleConversationsByQueue({
      analyticsApi,
    });
    server.registerTool(
      sampleConversationsByQueueTool.schema.name,
      {
        description: sampleConversationsByQueueTool.schema.description,
        inputSchema: sampleConversationsByQueueTool.schema.paramsSchema.shape,
        annotations: sampleConversationsByQueueTool.schema.annotations,
      },
      withAuth(sampleConversationsByQueueTool.call),
    );

    const queryQueueVolumesTool = queryQueueVolumes({ analyticsApi });
    server.registerTool(
      queryQueueVolumesTool.schema.name,
      {
        description: queryQueueVolumesTool.schema.description,
        inputSchema: queryQueueVolumesTool.schema.paramsSchema.shape,
        annotations: queryQueueVolumesTool.schema.annotations,
      },
      withAuth(queryQueueVolumesTool.call),
    );

    const voiceCallQualityTool = voiceCallQuality({ analyticsApi });
    server.registerTool(
      voiceCallQualityTool.schema.name,
      {
        description: voiceCallQualityTool.schema.description,
        inputSchema: voiceCallQualityTool.schema.paramsSchema.shape,
        annotations: voiceCallQualityTool.schema.annotations,
      },
      withAuth(voiceCallQualityTool.call),
    );

    const conversationSentimentTool = conversationSentiment({
      speechTextAnalyticsApi,
    });
    server.registerTool(
      conversationSentimentTool.schema.name,
      {
        description: conversationSentimentTool.schema.description,
        inputSchema: conversationSentimentTool.schema.paramsSchema.shape,
        annotations: conversationSentimentTool.schema.annotations,
      },
      withAuth(conversationSentimentTool.call),
    );

    const conversationTopicsTool = conversationTopics({
      speechTextAnalyticsApi,
      analyticsApi,
    });
    server.registerTool(
      conversationTopicsTool.schema.name,
      {
        description: conversationTopicsTool.schema.description,
        inputSchema: conversationTopicsTool.schema.paramsSchema.shape,
        annotations: conversationTopicsTool.schema.annotations,
      },
      withAuth(conversationTopicsTool.call),
    );

    const searchVoiceConversationsTool = searchVoiceConversations({
      analyticsApi,
    });
    server.registerTool(
      searchVoiceConversationsTool.schema.name,
      {
        description: searchVoiceConversationsTool.schema.description,
        inputSchema: searchVoiceConversationsTool.schema.paramsSchema.shape,
        annotations: searchVoiceConversationsTool.schema.annotations,
      },
      withAuth(searchVoiceConversationsTool.call),
    );

    const searchConversationsByContactIdTool = searchConversationsByContactId({
      analyticsApi,
    });
    server.registerTool(
      searchConversationsByContactIdTool.schema.name,
      {
        description: searchConversationsByContactIdTool.schema.description,
        inputSchema:
          searchConversationsByContactIdTool.schema.paramsSchema.shape,
        annotations: searchConversationsByContactIdTool.schema.annotations,
      },
      withAuth(searchConversationsByContactIdTool.call),
    );

    const conversationTranscriptTool = conversationTranscription({
      recordingApi,
      speechTextAnalyticsApi,
      fetchUrl: fetch,
    });
    server.registerTool(
      conversationTranscriptTool.schema.name,
      {
        description: conversationTranscriptTool.schema.description,
        inputSchema: conversationTranscriptTool.schema.paramsSchema.shape,
        annotations: conversationTranscriptTool.schema.annotations,
      },
      withAuth(conversationTranscriptTool.call),
    );

    const oauthClientsTool = oauthClients({
      oauthApi,
      authorizationApi,
    });
    server.registerTool(
      oauthClientsTool.schema.name,
      {
        description: oauthClientsTool.schema.description,
        inputSchema: oauthClientsTool.schema.paramsSchema.shape,
        annotations: oauthClientsTool.schema.annotations,
      },
      withAuth(oauthClientsTool.call),
    );

    const oauthClientUsageTool = oauthClientUsage({
      cache,
      oauthApi,
    });
    server.registerTool(
      oauthClientUsageTool.schema.name,
      {
        description: oauthClientUsageTool.schema.description,
        inputSchema: oauthClientUsageTool.schema.paramsSchema.shape,
        annotations: oauthClientUsageTool.schema.annotations,
      },
      withAuth(oauthClientUsageTool.call),
    );

    return server;
  };
}
