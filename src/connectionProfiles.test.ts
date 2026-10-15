import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { loadConnectionProfiles } from "./connectionProfiles.js";
import { createConfigRetriever } from "./createConfigRetriever.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function profilesFile(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), "genesys-profiles-"));
  directories.push(directory);
  const path = join(directory, "profiles.json");
  writeFileSync(path, content);
  return path;
}

test("profile selection overrides single-org env and stays fixed", () => {
  const file = profilesFile(
    JSON.stringify({
      "client-jp": {
        region: "jp",
        oAuthClientId: "jp-id",
        oAuthClientSecret: "jp-secret",
      },
      "client-sg": {
        region: "sg",
        oAuthClientId: "sg-id",
        oAuthClientSecret: "sg-secret",
      },
    }),
  );
  const env = {
    GENESYSCLOUD_PROFILES_FILE: file,
    GENESYSCLOUD_PROFILE: "client-jp",
    GENESYSCLOUD_REGION: "legacy-region",
    GENESYSCLOUD_OAUTHCLIENT_ID: "legacy-id",
    GENESYSCLOUD_OAUTHCLIENT_SECRET: "legacy-secret",
  };
  const jp = createConfigRetriever(env);
  env.GENESYSCLOUD_PROFILE = "client-sg";
  const sg = createConfigRetriever(env);
  expect(jp.getGenesysCloudConfig()).toEqual({
    success: true,
    value: {
      region: "mypurecloud.jp",
      oAuthClientId: "jp-id",
      oAuthClientSecret: "jp-secret",
    },
  });
  expect(sg.getGenesysCloudConfig()).toEqual({
    success: true,
    value: {
      region: "apse1.pure.cloud",
      oAuthClientId: "sg-id",
      oAuthClientSecret: "sg-secret",
    },
  });
});

test("missing or unknown profile never falls back to single-org credentials", () => {
  const file = profilesFile(
    JSON.stringify({
      client: {
        region: "jp",
        oAuthClientId: "id",
        oAuthClientSecret: "secret",
      },
    }),
  );
  const env = {
    GENESYSCLOUD_PROFILES_FILE: file,
    GENESYSCLOUD_REGION: "mypurecloud.jp",
    GENESYSCLOUD_OAUTHCLIENT_ID: "legacy-id",
    GENESYSCLOUD_OAUTHCLIENT_SECRET: "legacy-secret",
  };
  expect(createConfigRetriever(env).getGenesysCloudConfig().success).toBe(
    false,
  );
  expect(
    createConfigRetriever({
      ...env,
      GENESYSCLOUD_PROFILE: "missing",
    }).getGenesysCloudConfig().success,
  ).toBe(false);
  expect(
    createConfigRetriever({
      GENESYSCLOUD_PROFILE: "missing",
    }).getGenesysCloudConfig().success,
  ).toBe(false);
});

test("invalid profile files fail without exposing credentials", () => {
  const secret = "do-not-log-this-secret";
  for (const data of [
    `{ "secret": "${secret}"`,
    JSON.stringify({
      client: {
        region: "invalid",
        oAuthClientId: "id",
        oAuthClientSecret: secret,
      },
    }),
    JSON.stringify({
      "bad/name": {
        region: "jp",
        oAuthClientId: "id",
        oAuthClientSecret: secret,
      },
    }),
    "{}",
  ]) {
    const file = profilesFile(data);
    let error: unknown;
    try {
      loadConnectionProfiles({ GENESYSCLOUD_PROFILES_FILE: file });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(secret);
  }
});
