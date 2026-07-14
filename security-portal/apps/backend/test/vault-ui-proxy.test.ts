import { describe, expect, it } from "vitest";
import { buildVaultUiTarget, vaultUiRequestHeaders } from "../src/vault/vault-ui-proxy";

describe("Vault UI gateway", () => {
  it("forwards only Vault UI and API paths to the configured Vault origin", () => {
    expect(
      buildVaultUiTarget("http://vault.internal:8200", "/ui/?namespace=admin").toString()
    ).toBe("http://vault.internal:8200/ui/?namespace=admin");
    expect(
      buildVaultUiTarget("http://vault.internal:8200", "/v1/sys/health?standbyok=true").toString()
    ).toBe("http://vault.internal:8200/v1/sys/health?standbyok=true");
    expect(() => buildVaultUiTarget("http://vault.internal:8200", "/api/admin/users")).toThrow(
      "Vault UI gateway path is not allowed"
    );
    expect(() => buildVaultUiTarget("http://vault.internal:8200", "//example.com/ui/")).toThrow(
      "Vault UI gateway path is not allowed"
    );
  });

  it("forwards Vault headers without leaking the Portal session or authorization headers", () => {
    const headers = vaultUiRequestHeaders({
      accept: "application/json",
      "accept-language": "ko-KR",
      authorization: "Bearer portal-token",
      cookie: "security_portal_session=session-id",
      host: "security-portal.example.com",
      "x-forwarded-for": "203.0.113.10",
      "x-vault-namespace": "admin",
      "x-vault-token": "vault-token"
    });

    expect(Object.fromEntries(headers.entries())).toEqual({
      accept: "application/json",
      "accept-language": "ko-KR",
      "x-vault-namespace": "admin",
      "x-vault-token": "vault-token"
    });
  });
});
