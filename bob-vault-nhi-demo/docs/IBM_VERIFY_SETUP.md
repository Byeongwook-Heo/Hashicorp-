# IBM Verify setup

IBM Verify tenant administration is the only external configuration still required.

## Values to collect

- HTTPS token endpoint
- HTTPS Verify JWKS URL for issued access tokens
- exact issuer claim
- access-token audience
- API client ID
- custom scope `vault.db.read`
- NHI claim name, expected `client_id` for an API-client token
- NHI claim value, the generated API client ID

Do not create or download a client secret. Configure client authentication as `private_key_jwt` with RS256.

## Register the KMS public key

The deployed public JWK is available at:

```text
https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io/.well-known/jwks.json
```

The tenant is `https://ceiam.verify.ibm.com` in the IBM Verify Europe region. The ALB permits the documented Europe egress IPs on HTTPS, but listener rules forward only the exact public JWKS path. Requests from those addresses to `/mcp`, `/demo`, `/healthz`, or any other path receive HTTP 403. The ALB is never opened to `0.0.0.0/0`.

Apply or refresh this narrow exception with:

```bash
make verify-jwks-plan
make verify-jwks-apply
```

In Verify, set the client authentication method to `Private key JWT` and enter the deployed URL in `JWKS URI`.

Use `bob-db-reader` as the API client name. Leave `Additional properties` empty: IBM documents those values as API-client metadata, not access-token claims. After creation, use the generated client ID as the technical NHI binding (`client_id`) while retaining `bob-db-reader` as the human-readable identity name.

Required client assertion validation:

- algorithm `RS256`
- `iss` and `sub` equal the client ID
- `aud` equals the token endpoint
- assertion lifetime 60 seconds
- unique `jti`; replay rejection enabled

Required access token:

- signed JWT, not opaque
- expected issuer and audience
- NHI claim equal to `bob-db-reader`
- short lifetime appropriate for the demo

## Store the public integration metadata

Set the following shell variables without placing them in a file:

```bash
export VERIFY_TOKEN_URL='https://…'
export VERIFY_JWKS_URL='https://…'
export VERIFY_ISSUER='https://…'
export VERIFY_AUDIENCE='…'
export VERIFY_CLIENT_ID='…'
export VERIFY_SCOPE='vault.db.read'
export VERIFY_NHI_CLAIM='client_id'
export VERIFY_NHI_VALUE="${VERIFY_CLIENT_ID}"
make configure-verify
```

Then run:

```bash
make verify-preflight
make vault-bootstrap
make deploy-app
make smoke
```

The preflight prints only validation outcomes. It never prints the assertion or access token.

## One-time opaque-to-JWT conversion

Some Verify tenants expose `Private key JWT` and custom scopes in the Admin UI
but do not expose the API client's access-token format. If preflight reaches
JWT verification and fails because Verify issued an opaque token, temporarily
grant only `Manage API clients` to the same client. Do not add the setting to
Additional properties.

Commit and upload the source before invoking the CodeBuild-only workflow:

```bash
make upload-source
make verify-client-jwt-plan
CONFIRM_VERIFY_CLIENT_UPDATE=bob-vault-nhi-demo make verify-client-enable-jwt
make verify-preflight
```

The plan is read-only and prints no token or client secret. The guarded update
reads the complete client definition, refuses to continue if the response
omits the existing client secret, changes `accessTokenType` to `jwt`, and
removes `manageAPIClients` in the same request. The update is intentionally
one-shot because the client no longer has management access afterward.

## Vault claim mapping

The bootstrap creates Vault namespace `demo`, JWT role `bob-orders`, and policy `bob-orders`. The role binds the Verify issuer, audience, and NHI claim and grants only `read` on `database/creds/bob-orders-readonly`.
