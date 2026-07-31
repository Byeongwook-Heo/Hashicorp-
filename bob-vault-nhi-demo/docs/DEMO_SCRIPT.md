# Five-minute chatbot demo

## 0:00–1:00 — Verify the user

Open the root URL and click **IBM Verify로 로그인**. After login, show the
header identity indicator. Explain that the browser has an encrypted HttpOnly
session; raw access tokens are not exposed to the page JavaScript.

## 1:00–2:30 — Normal request

Ask:

```text
주문 ORD-1001 상태를 확인해줘
```

Expected sequence:

1. The Agent maps the natural-language request to the fixed `get_order_status` tool.
2. The Agent calls the MCP Streamable HTTP endpoint with the Verify user token.
3. MCP validates the user JWT.
4. KMS signs the Agent client assertion.
5. Verify STS exchanges the user token for an OBO JWT.
6. Vault validates the user `sub`, Agent binding, issuer, and audience.
7. Vault issues `bob-orders-readonly` for 120 seconds.
8. RDS returns one synthetic order row; the lease and Vault token are revoked.

Expected business answer: payment is `PAID`, delivery is `PREPARING`. The right
rail shows the security trace without showing any credential.

## 2:30–3:30 — Aggregate

Ask:

```text
오늘 실패한 결제를 요약해줘
```

The result contains only a bounded count and delivery-state grouping, not
customer data.

Alternative prompts are available for the two additional read-only tools:

```text
최근 주문 5건을 요약해줘
최근 7일 실패 결제 통계를 보여줘
```

## 3:30–4:30 — Policy denial

Ask:

```text
CUS-1001의 민감 결제 정보를 보여줘
```

Expected: Verify user and Agent authentication succeeds, Vault denies
`database/creds/bob-payment-pii`, and no database query runs. The security trace
ends at **Vault 정책 · 차단**.

Then ask `왜 방금 요청이 차단됐어?` to show the decision explanation without
performing a second database request.

## 4:30–5:00 — Operations evidence

Use the integrated **NHI 접근 제어** panel to show the sanitized identity,
Vault, policy, database events, and the released credential state. The
**초기화** button clears only the current in-memory demo session. Close with:

> The user is known, the Agent is bound, and the permission disappears when the
> task is done.
