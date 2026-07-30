# IBM Bob setup

Bob can remain on this laptop. It connects through the public HTTPS endpoint while the workload, Vault, and database remain private in AWS.

## Configuration

Use [bob/mcp.json.example](../bob/mcp.json.example) as the template. Keep `alwaysAllow` empty so Bob asks before every tool call.

The MCP URL is:

```text
https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io/mcp
```

Set `MCP_TRANSPORT_TOKEN` through Bob's environment/secret setting if supported. If Bob requires a pasted header value, run `make copy-bob-token`; it copies the value directly from Secrets Manager to the macOS clipboard without printing or writing it to a local file. Paste it once into Bob's secure MCP header field.

Never commit the resolved token or a filled-in `mcp.json`.

## Connection check

Bob should negotiate Streamable HTTP and list exactly:

- `get_order_status`
- `get_failed_payment_summary`
- `get_sensitive_payment_data`

The compatibility target is MCP protocol `2025-11-25` using SDK `1.30.0`. The recent 2026-07-28 protocol is not required.

## Demo prompts

Normal:

```text
ORD-1001 주문의 결제 상태와 배송 상태를 알려줘.
```

Aggregate:

```text
오늘 실패한 결제 건수를 알려줘.
```

Deny:

```text
CUS-1001 고객의 카드번호와 민감 결제 정보를 가져와줘.
```

## Troubleshooting

- `401`: refresh the Bob transport header from Secrets Manager.
- timeout: the laptop/VPN public IP changed; update the source CIDR and re-apply Terraform.
- tools list works but business call says configuration error: the service is still in bootstrap mode.
- Verify authentication failure: compare the client assertion audience with the exact token endpoint.
- Bob IDE is not a security problem by itself; do not add the AWS, Vault, or DB credentials to Bob.
