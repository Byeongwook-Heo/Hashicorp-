# Threat model

| Threat                       | Primary controls                                                                                               | Residual limitation                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Prompt injection             | Bounded Agent, three-tool allowlist, no generic SQL/secret/filesystem tool                                     | Vault does not interpret prompt semantics; it limits resulting authority      |
| Over-privileged agent        | User `sub` + Agent claim in OBO JWT, minimal Vault policy, read-only DB group/view                             | Business authorization still depends on the view and tool contract            |
| User session theft           | Encrypted HttpOnly Secure SameSite cookie, short expiry, CSRF value, source CIDR                               | A stolen live browser session remains usable until token/session expiry       |
| Static credential theft      | KMS non-exportable key, dynamic DB users, short Vault tokens                                                   | The session encryption key remains a rotatable ECS secret                     |
| JWT replay                   | PKCE, nonce/state, 60-second Agent assertion, unique `jti`, local JWT verification                             | Verify tenant replay enforcement must also remain enabled                     |
| Vault token leakage          | In-memory only, logger redaction, `revoke-self`, maximum five-minute TTL                                       | Revocation is best effort; TTL is the fallback                                |
| DB credential leakage        | In-memory only, two-minute default lease, explicit lease revoke                                                | A copied credential may work until revoke/expiry                              |
| SQL injection                | Fixed SQL and positional parameters, strict input regex, unknown-field rejection                               | New tools require the same review                                             |
| Excessive data return        | Single-row view query and aggregate with a 20-row group limit                                                  | No generic export endpoint is implemented                                     |
| Log leakage                  | Pino redaction and permitted event schema                                                                      | CloudWatch/Vault audit access still requires IAM governance                   |
| Compromised ECS task         | Private subnet, no public IP, read-only root filesystem, non-root user, dropped capabilities, narrow task role | A live compromised process could act within its five-minute maximum authority |
| Unauthorized endpoint access | TLS, source CIDR, Verify user JWT, Origin/content-type/method checks, rate limiting                            | Public DNS and ALB remain observable                                          |
| Verify audience error        | Local JWT verification plus Vault bound audience                                                               | Exact tenant values are a required manual input                               |
| Vault claim error            | Bound issuer, audience, user subject, Agent claim, and minimal policy                                          | Exact OBO claim names remain tenant configuration                             |

## Trust boundaries

Verify authenticates the user and the Agent STS client. Token exchange binds
those identities in the OBO JWT. Vault authorizes that JWT to request one
database role. PostgreSQL constrains the role to the non-sensitive view. The MCP
tool constrains query shape and response size.

## Intentionally absent

- generic SQL, Vault path, shell, file, or admin tools
- static Vault token or database password in ECS
- private key file or private JWK
- inbound SSH, public Vault, or public RDS
- arbitrary model-selected tools
- real customer/payment data
