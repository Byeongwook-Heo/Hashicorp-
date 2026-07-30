# Blockers and external inputs

## Does not block implementation or bootstrap deployment

IBM Verify values are intentionally optional until the bootstrap MCP endpoint and KMS-backed JWKS are online.

## Required before Verify preflight

- `VERIFY_ISSUER`
- `VERIFY_TOKEN_ENDPOINT`
- `VERIFY_JWKS_URL`
- `VERIFY_CLIENT_ID`
- Exact client assertion audience accepted by the tenant
- JWT access token audience
- Actual NHI claim name and expected value

## Required before the event

- Confirm the event venue or VPN public egress CIDR and update `ALLOWED_SOURCE_CIDRS`.
- Complete `gh auth login` before publishing the branch and draft pull request.
- Configure Bob with the MCP transport token retrieved through the approved secret handoff process.

## Accepted constraints

- The Vault license terminates on 2026-09-02 00:00 UTC. The event is on 2026-09-01.
- The selected hardened AMI is x86_64, so the Vault instance type must also be x86_64.
- IBM Verify configuration remains a documented manual step unless tenant administration credentials are supplied.
