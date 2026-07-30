# IBM Verify setup

IBM Verify tenant administration is the only external configuration still required.

## Values to collect

- HTTPS token endpoint
- HTTPS Verify JWKS URL for issued access tokens
- exact issuer claim
- access-token audience
- API client ID
- optional scope, default `openid`
- NHI claim name, recommended `sub`
- NHI value, recommended `bob-db-reader`

Do not create or download a client secret. Configure client authentication as `private_key_jwt` with RS256.

## Register the KMS public key

The deployed public JWK is available at:

```text
https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io/.well-known/jwks.json
```

The ALB is source-CIDR restricted. Download the JWK from the approved operator network and upload/register it as the client's static public JWK in Verify. If the tenant only supports remote JWKS retrieval, add only the documented Verify egress CIDR to the source allowlist; do not open the ALB to `0.0.0.0/0`.

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
export VERIFY_SCOPE='openid'
export VERIFY_NHI_CLAIM='sub'
export VERIFY_NHI_VALUE='bob-db-reader'
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

## Vault claim mapping

The bootstrap creates Vault namespace `demo`, JWT role `bob-orders`, and policy `bob-orders`. The role binds the Verify issuer, audience, and NHI claim and grants only `read` on `database/creds/bob-orders-readonly`.
