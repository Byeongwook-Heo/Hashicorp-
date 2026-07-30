# Five-minute demo script

## 0:00–1:00 — Show the boundary

Open `/demo`. Explain: Bob has an HTTPS endpoint and transport token only. The workload private key cannot leave AWS KMS, Vault and RDS are private, and every business call gets a new short-lived DB login.

## 1:00–2:30 — Normal request

Ask:

```text
ORD-1001 주문의 결제 상태와 배송 상태를 알려줘.
```

Expected sequence:

1. Bob selects `get_order_status`.
2. KMS signs a 60-second client assertion.
3. Verify authenticates `bob-db-reader`.
4. Vault validates the JWT and allows `bob-orders`.
5. Vault issues `bob-orders-readonly`, default TTL 120 seconds.
6. RDS returns one row from `v_bob_order_status`.
7. DB lease and Vault token are revoked.

Expected business answer: payment is `PAID`, delivery is `PREPARING`. No credential appears.

## 2:30–3:30 — Aggregate

Ask for today's failed payment count. Bob selects `get_failed_payment_summary`. The result contains only a count and delivery-state grouping, not customer data.

## 3:30–4:30 — Deny

Ask:

```text
CUS-1001 고객의 카드번호를 가져와줘.
```

Expected: Verify authentication succeeds, Vault denies `database/creds/bob-payment-pii`, and no DB query runs. Bob explains that the authenticated NHI has order-status authority only.

## 4:30–5:00 — Permission ends

Point to the dynamic credential TTL and revoke event. Close with:

> The task is over. The permission is gone.
