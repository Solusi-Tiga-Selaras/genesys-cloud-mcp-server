import type { ApiClientClass } from "purecloud-platform-client-v2";
import type { z } from "zod";
import type { ConfigRetriever } from "../createConfigRetriever.js";
import type { ToolCall } from "../tools/utils/createTool.js";
import { errorResult } from "../tools/utils/errorResult.js";

type AuthResult =
  | { authenticated: true }
  | { authenticated: false; reason: string };

async function authenticate(
  apiClient: ApiClientClass,
  configRetriever: ConfigRetriever,
): Promise<AuthResult> {
  const config = configRetriever.getGenesysCloudConfig();
  if (!config.success) {
    return { authenticated: false, reason: config.reason };
  }
  const authConfig = config.value;

  try {
    apiClient.setEnvironment(authConfig.region);
    await apiClient.loginClientCredentialsGrant(
      authConfig.oAuthClientId,
      authConfig.oAuthClientSecret,
    );
  } catch (e: unknown) {
    return {
      authenticated: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  return {
    authenticated: true,
  };
}

export const OAuthClientCredentialsWrapper = (
  configRetriever: ConfigRetriever,
  apiClient: ApiClientClass,
) => {
  let authentication: Promise<AuthResult> | undefined;
  return <Schema extends z.ZodType = z.ZodType>(
    call: ToolCall<Schema>,
  ): ToolCall<Schema> =>
    async (input: z.output<Schema>) => {
      authentication ??= authenticate(apiClient, configRetriever);
      const authResult = await authentication;
      if (!authResult.authenticated) {
        authentication = undefined;
        return errorResult(
          `Failed to authenticate with Genesys Cloud. Reason:\n${authResult.reason}`,
        );
      }

      return call(input);
    };
};
