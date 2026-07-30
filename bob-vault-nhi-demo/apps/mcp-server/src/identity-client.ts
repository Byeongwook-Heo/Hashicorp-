import { createRemoteJWKSet, jwtVerify } from "jose";
import { request } from "undici";
import { z } from "zod";

import {
  AuthenticationError,
  ConfigurationError,
  ExternalServiceError,
} from "./errors.js";
import { KmsClientAssertionSigner } from "./kms-signer.js";

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(20),
    token_type: z.string().min(1),
    expires_in: z.number().int().positive().optional(),
  })
  .loose();

export interface IdentityProvider {
  getVerifiedAccessToken(): Promise<string>;
}

interface IdentityClientConfig {
  tokenUrl: string;
  jwksUrl: string;
  issuer: string;
  audience: string;
  clientId: string;
  scope?: string;
  nhiClaim: string;
  nhiValue: string;
}

export class VerifyIdentityClient implements IdentityProvider {
  readonly #config: IdentityClientConfig;
  readonly #signer: KmsClientAssertionSigner;
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;

  public constructor(
    config: IdentityClientConfig,
    signer: KmsClientAssertionSigner,
  ) {
    this.#config = config;
    this.#signer = signer;
    this.#jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
      timeoutDuration: 5_000,
    });
  }

  public async getVerifiedAccessToken(): Promise<string> {
    const assertion = await this.#signer.sign();
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.#config.clientId,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      ...(this.#config.scope ? { scope: this.#config.scope } : {}),
    });

    let response;
    try {
      response = await request(this.#config.tokenUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        bodyTimeout: 5_000,
        headersTimeout: 5_000,
        maxRedirections: 0,
      });
    } catch (error) {
      throw new ExternalServiceError(
        "IBM Verify",
        "token endpoint was unavailable",
        {
          cause: error,
        },
      );
    }

    const responseText = await response.body.text();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new AuthenticationError(
        `IBM Verify rejected the client assertion (${response.statusCode})`,
      );
    }

    let tokenResponse: z.infer<typeof tokenResponseSchema>;
    try {
      tokenResponse = tokenResponseSchema.parse(JSON.parse(responseText));
    } catch (error) {
      throw new ExternalServiceError(
        "IBM Verify",
        "token response was invalid",
        { cause: error },
      );
    }

    try {
      const verification = await jwtVerify(
        tokenResponse.access_token,
        this.#jwks,
        {
          issuer: this.#config.issuer,
          audience: this.#config.audience,
          algorithms: ["RS256"],
        },
      );
      const actualNhi = verification.payload[this.#config.nhiClaim];
      if (actualNhi !== this.#config.nhiValue) {
        throw new AuthenticationError(
          "IBM Verify token did not contain the required NHI binding",
        );
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        "IBM Verify access token validation failed",
        { cause: error },
      );
    }

    return tokenResponse.access_token;
  }
}

export class UnconfiguredIdentityClient implements IdentityProvider {
  public async getVerifiedAccessToken(): Promise<string> {
    throw new ConfigurationError(
      "Identity flow is not configured yet; add the IBM Verify values and switch APP_MODE to aws",
    );
  }
}
