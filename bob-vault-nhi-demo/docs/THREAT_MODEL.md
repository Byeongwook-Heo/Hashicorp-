# Threat model

| Threat                       | Primary controls                                                                                               | Residual limitation                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Prompt injection             | Three-tool allowlist, no generic SQL/secret/filesystem tool, per-call approval                                 | Vault does not detect malicious prompt text; it limits resulting authority    |
| Over-privileged agent        | Verify NHI binding, minimal Vault policy, read-only DB group role and view                                     | Business authorization still depends on the view and tool contract            |
| Static credential theft      | KMS non-exportable key, dynamic DB users, short Vault tokens                                                   | MCP bearer token remains a transport secret and must be protected             |
| JWT replay                   | 60-second assertion, unique `jti`, Verify replay rejection                                                     | Verify tenant replay enforcement must be enabled by its administrator         |
| Stolen MCP bearer            | ALB source CIDR, constant-time comparison, rate limiting                                                       | A token stolen on the approved network remains usable until rotated           |
| Vault token leakage          | In-memory only, logger redaction, `revoke-self`, maximum five-minute TTL                                       | Revocation is best effort; TTL is the fallback                                |
| DB credential leakage        | In-memory only, two-minute default lease, explicit lease revoke                                                | A copied credential may work until revoke/expiry                              |
| SQL injection                | Fixed SQL and positional parameters, strict input regex, unknown-field rejection                               | New tools require the same review                                             |
| Excessive data return        | Single-row view query and aggregate with a 20-row group limit                                                  | No generic export endpoint is implemented                                     |
| Log leakage                  | Pino redaction and permitted event schema                                                                      | CloudWatch/Vault audit access still requires IAM governance                   |
| Compromised ECS task         | Private subnet, no public IP, read-only root filesystem, non-root user, dropped capabilities, narrow task role | A live compromised process could act within its five-minute maximum authority |
| Unauthorized endpoint access | TLS, source CIDR, bearer token, Origin/content-type/method checks                                              | Public DNS and ALB remain observable                                          |
| Verify audience error        | Local JWT verification plus Vault bound audience                                                               | Exact tenant values are a required manual input                               |
| Vault claim error            | Bound issuer, audience, NHI claim, and minimal policy                                                          | Misconfiguration is caught by preflight/smoke tests, not inferred             |

## Trust boundaries

Verify authenticates the NHI. Vault authorizes that authenticated NHI to request one database role. PostgreSQL constrains the role to the non-sensitive view. The MCP tool constrains query shape and response size. No one control is treated as sufficient by itself.

## Intentionally absent

- generic SQL, Vault path, shell, file, or admin tools
- static Vault token or database password in ECS
- private key file or private JWK
- inbound SSH, public Vault, or public RDS
- automatic tool approval in Bob
- real customer/payment data
