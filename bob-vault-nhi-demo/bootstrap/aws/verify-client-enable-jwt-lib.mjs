const ADMIN_ENTITLEMENT = "manageAPIClients";

export function buildVerifyManagementUrl(tokenUrlValue, issuerValue, clientId) {
  const tokenUrl = requireHttpsUrl(tokenUrlValue, "VERIFY_TOKEN_URL");
  const issuerUrl = requireHttpsUrl(issuerValue, "VERIFY_ISSUER");
  if (tokenUrl.origin !== issuerUrl.origin) {
    throw new Error(
      "VERIFY_TOKEN_URL and VERIFY_ISSUER must use the same tenant origin",
    );
  }
  if (typeof clientId !== "string" || clientId.length === 0) {
    throw new Error("VERIFY_CLIENT_ID is required");
  }

  return new URL(
    `/v1.0/apiclients/${encodeURIComponent(clientId)}`,
    tokenUrl.origin,
  );
}

export function prepareVerifyClientUpdate(value, expectedClientId) {
  if (!isPlainObject(value)) {
    throw new Error("IBM Verify API client response was not an object");
  }
  if (value.clientId !== expectedClientId) {
    throw new Error("IBM Verify API returned a different client ID");
  }
  if (typeof value.clientName !== "string" || value.clientName.length === 0) {
    throw new Error("IBM Verify API client response did not contain a name");
  }
  if (
    typeof value.clientSecret !== "string" ||
    value.clientSecret.length === 0
  ) {
    throw new Error(
      "IBM Verify API client response omitted the client secret; refusing an update that could rotate it",
    );
  }
  if (!Array.isArray(value.entitlements)) {
    throw new Error(
      "IBM Verify API client response did not contain entitlements",
    );
  }
  if (!value.entitlements.every((item) => typeof item === "string")) {
    throw new Error("IBM Verify API client entitlements were malformed");
  }
  if (!value.entitlements.includes(ADMIN_ENTITLEMENT)) {
    throw new Error(
      "The API client does not have the temporary manageAPIClients entitlement",
    );
  }
  if (typeof value.jwkUri !== "string" || !isHttpsUrl(value.jwkUri)) {
    throw new Error("The API client does not contain a valid HTTPS JWKS URI");
  }

  return {
    ...value,
    accessTokenType: "jwt",
    entitlements: value.entitlements.filter(
      (entitlement) => entitlement !== ADMIN_ENTITLEMENT,
    ),
  };
}

export function sanitizedUpdatePlan(current, updated) {
  return {
    clientId: current.clientId,
    currentAccessTokenType: current.accessTokenType ?? "default",
    requestedAccessTokenType: updated.accessTokenType,
    removesTemporaryAdminEntitlement:
      current.entitlements.includes(ADMIN_ENTITLEMENT) &&
      !updated.entitlements.includes(ADMIN_ENTITLEMENT),
    preservedEntitlementCount: updated.entitlements.length,
    preservesClientSecret:
      current.clientSecret === updated.clientSecret &&
      typeof updated.clientSecret === "string",
    preservesJwksUri: current.jwkUri === updated.jwkUri,
  };
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function requireHttpsUrl(value, name) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS`);
  }
  return url;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
