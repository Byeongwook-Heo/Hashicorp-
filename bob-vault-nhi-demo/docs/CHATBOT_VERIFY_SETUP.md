# IBM Verify chatbot and OBO setup

The chatbot needs two distinct Verify registrations. Do not reuse the deleted
temporary management client.

## 1. User-facing OIDC application

In the Verify admin console, create an OpenID Connect application for the
browser login.

Use:

- Grant type: **Authorization Code**
- Redirect URI:
  `https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io/auth/callback`
- PKCE: required, `S256`
- Client type: public (no client secret is stored in this lab)
- Access token type: JWT
- Scopes: `openid profile vault.db.read`

The application is the user-facing client. Its client ID becomes
`VERIFY_USER_CLIENT_ID`.

IBM references:

- [Authorization Code with PKCE sample](https://docs.verify.ibm.com/verify/docs/developer-portal-authorization-code-with-pkce-example)
- [OIDC token endpoint](https://docs.verify.ibm.com/verify/reference/handletoken)

## 2. Agent STS client

Create a separate STS client for OAuth 2.0 Token Exchange.

Configure:

- Grant: `urn:ietf:params:oauth:grant-type:token-exchange`
- Subject token type:
  `urn:ietf:params:oauth:token-type:access_token`
- Requested token type:
  `urn:ietf:params:oauth:token-type:access_token`
- Client authentication: `private_key_jwt`
- JWKS URI:
  `https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io/.well-known/jwks.json`
- Output access token: JWT, `RS256`
- Scope: `vault.db.read`
- Audience: the exact Vault audience selected for this lab

The STS client ID becomes `VERIFY_OBO_CLIENT_ID`. The service verifies both the
preserved user `sub` and the configured Agent claim (default `client_id`) before
passing the OBO token to Vault.

IBM references:

- [OAuth 2.0 Token Exchange](https://docs.verify.ibm.com/verify/docs/oauth-20-token-exchange)
- [Token Exchange administration and STS clients](https://docs.verify.ibm.com/verify/v2.0/docs/token-exchange)

## 3. Store public metadata in AWS

Run from the project root after loading the AWS credentials:

```bash
export VERIFY_USER_AUTHORIZATION_URL='https://ceiam.verify.ibm.com/v1.0/endpoint/default/authorize'
export VERIFY_USER_TOKEN_URL='https://ceiam.verify.ibm.com/v1.0/endpoint/default/token'
export VERIFY_USER_JWKS_URL='https://ceiam.verify.ibm.com/v1.0/endpoint/default/jwks'
export VERIFY_USER_ISSUER='https://ceiam.verify.ibm.com/oidc/endpoint/default'
export VERIFY_USER_CLIENT_ID='<user-oidc-application-client-id>'
export VERIFY_USER_AUDIENCE="${VERIFY_USER_CLIENT_ID}"
export VERIFY_USER_SCOPES='openid profile vault.db.read'

export VERIFY_OBO_TOKEN_URL='https://ceiam.verify.ibm.com/oauth2/token'
export VERIFY_OBO_JWKS_URL='https://ceiam.verify.ibm.com/oauth2/jwks'
export VERIFY_OBO_ISSUER='https://ceiam.verify.ibm.com/oauth2'
export VERIFY_OBO_CLIENT_ID='<agent-sts-client-id>'
export VERIFY_OBO_AUDIENCE='<exact-vault-audience>'
export VERIFY_OBO_SCOPE='vault.db.read'
export VERIFY_OBO_ACTOR_CLAIM='client_id'
export VERIFY_OBO_ACTOR_VALUE="${VERIFY_OBO_CLIENT_ID}"

make configure-chatbot-verify
make bootstrap-chat-session-secret
```

Only public client metadata is stored in Parameter Store. The randomly generated
session encryption key is created directly in Secrets Manager and is never
printed or placed in Terraform state.

## 4. Re-bind Vault and deploy

```bash
make upload-source
make vault-bootstrap
make ci
make build-image
make deploy-chatbot
```

`vault-bootstrap` is idempotent. If the database engine is already configured,
it updates only the Verify/Vault JWT role and preserves the rotating PostgreSQL
configuration.

## 5. Validate

1. Open the root URL and complete Verify login.
2. Ask for `ORD-1001`.
3. Confirm the response has an MCP tool name and a four-step security trace.
4. Open `/ops` and confirm sanitized `transport`, `identity`, `vault`, and
   `database` events.
5. Run the sensitive-data prompt and confirm Vault denial with no DB event.
