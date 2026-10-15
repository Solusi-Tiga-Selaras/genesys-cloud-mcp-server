import { readFileSync } from "node:fs";
import { z } from "zod";
import type { GenesysCloudConfig } from "./createConfigRetriever.js";

const regions = {
  jp: "mypurecloud.jp",
  sg: "apse1.pure.cloud",
  "mypurecloud.jp": "mypurecloud.jp",
  "apse1.pure.cloud": "apse1.pure.cloud",
} as const;

const profilesSchema = z.record(
  z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  z.strictObject({
    region: z.enum(["jp", "sg", "mypurecloud.jp", "apse1.pure.cloud"]),
    oAuthClientId: z.string().trim().min(1),
    oAuthClientSecret: z.string().min(1),
  }),
);

export function loadConnectionProfiles(
  env: NodeJS.ProcessEnv,
): ReadonlyMap<string, GenesysCloudConfig> {
  const file = env.GENESYSCLOUD_PROFILES_FILE;
  if (!file) return new Map();

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("Unable to read Genesys Cloud profiles file as JSON");
  }

  const result = profilesSchema.safeParse(data);
  if (!result.success || Object.keys(result.data).length === 0) {
    throw new Error(
      "Invalid Genesys Cloud profiles: expected named profiles with region jp/sg, oAuthClientId, and oAuthClientSecret",
    );
  }

  return new Map(
    Object.entries(result.data).map(([name, profile]) => [
      name,
      { ...profile, region: regions[profile.region] },
    ]),
  );
}
