import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { ConfigurationError } from "../src/errors.js";

const baseEnvironment = {
  NODE_ENV: "test",
  APP_MODE: "bootstrap",
  TRANSPORT_BEARER_TOKEN: "a".repeat(48),
};

describe("loadConfig", () => {
  it("loads a secure bootstrap configuration", () => {
    const config = loadConfig(baseEnvironment);

    expect(config.appMode).toBe("bootstrap");
    expect(config.port).toBe(8080);
    expect(config.vault.jwtAuthPath).toBe("jwt");
    expect(config.database.caFile).toBe("/app/certs/rds-ca.pem");
  });

  it("rejects short transport bearer secrets", () => {
    expect(() =>
      loadConfig({ ...baseEnvironment, TRANSPORT_BEARER_TOKEN: "short" }),
    ).toThrow(ConfigurationError);
  });

  it("requires every identity boundary in AWS mode", () => {
    expect(() => loadConfig({ ...baseEnvironment, APP_MODE: "aws" })).toThrow(
      /VERIFY_TOKEN_URL/,
    );
  });

  it("normalizes escaped certificate newlines", () => {
    const config = loadConfig({
      ...baseEnvironment,
      VAULT_CA_PEM: "first\\nsecond",
      DB_CA_PEM: "db-first\\ndb-second",
    });

    expect(config.vault.caPem).toBe("first\nsecond");
    expect(config.database.caPem).toBe("db-first\ndb-second");
  });
});
