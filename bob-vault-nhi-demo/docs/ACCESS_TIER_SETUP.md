# Verify access-tier rollout

The application, MCP boundary, Vault, and PostgreSQL support three protected
data states:

- `orders-full`: all synthetic non-sensitive orders
- `orders-limited`: only orders owned by synthetic customer `CUS-1001`
- `unapproved`: general chat only; MCP, Vault, and PostgreSQL are not called

## Safe rollout modes

`ACCESS_TIER_ENFORCEMENT` supports:

- `off`: ignore the authorization claim and preserve the legacy full-reader
  behavior.
- `audit`: preserve the legacy full-reader behavior, record whether the signed
  claim is present, and expose the rollout state in the sanitized status API.
- `enforce`: require a recognized signed claim in both the user Access Token
  and the OBO JWT. Missing, unknown, or ambiguous values fail closed.

The deployed default is `audit`. Do not switch to `enforce` until Verify emits
the claim in both tokens and a limited user has completed an end-to-end test.

## Verify tenant work still required

1. Create groups or entitlements corresponding to `orders-full` and
   `orders-limited`.
2. Assign the current demo owner to `orders-full` and a second test user to
   `orders-limited`.
3. Map the user authorization into the JWT claim `access_tier` for the OIDC
   Access Token.
4. Preserve `access_tier` in the STS Token Exchange response so the OBO JWT
   carries the same signed value.
5. Confirm that the OBO JWT preserves `sub`, binds the Agent client, and carries
   exactly one supported access tier.

The claim name and values are configurable:

```bash
export VERIFY_ACCESS_TIER_CLAIM='access_tier'
export VERIFY_ACCESS_TIER_FULL_VALUE='orders-full'
export VERIFY_ACCESS_TIER_LIMITED_VALUE='orders-limited'
```

## Prepared downstream enforcement

Vault contains separate JWT roles, policies, and dynamic database paths:

```text
bob-orders-full     -> database/creds/bob-orders-full
bob-orders-limited  -> database/creds/bob-orders-limited
```

PostgreSQL contains separate group roles and fixed views:

```text
bob_orders_full_reader     -> v_bob_order_status_full
bob_orders_limited_reader  -> v_bob_order_status_limited
```

The limited view contains only the synthetic `CUS-1001` scope. The service also
chooses fixed SQL per validated access tier; arbitrary table or view names are
never accepted from model output or browser input.

## Deployment sequence

Keep the current demo available while preparing the downstream roles:

```bash
make upload-source
make db-bootstrap
ACCESS_TIER_ENFORCEMENT=audit make vault-bootstrap
make ci
make build-image
ACCESS_TIER_ENFORCEMENT=audit make deploy-chatbot
make smoke
make access-tier-smoke
make demo-access-report
make demo-status
```

After Verify configuration and a real full/limited token inspection, enable
strict enforcement in a scheduled change window:

```bash
ACCESS_TIER_ENFORCEMENT=enforce make vault-bootstrap
ACCESS_TIER_ENFORCEMENT=enforce make deploy-chatbot
make smoke
make access-tier-smoke
make demo-access-report
```

In `enforce`, the legacy `bob-orders` Vault role and
`bob-orders-readonly` database role are removed from the active path.

## Expected checks

| Identity             | `ORD-1001`        | `ORD-1002`                | General chat |
| -------------------- | ----------------- | ------------------------- | ------------ |
| `orders-full`        | allowed           | allowed                   | allowed      |
| `orders-limited`     | allowed           | not found or unauthorized | allowed      |
| missing/invalid tier | denied before MCP | denied before MCP         | allowed      |

Do not reveal whether an out-of-scope order exists. Return the same
"not found or unauthorized" response for both cases.

`make demo-access-report` prints a presentation-safe comparison of the full
and limited tiers. It displays only user labels, Vault/DB role names, visible
order IDs, the full-view denial result, and lease cleanup status. Dynamic
database usernames, passwords, Vault tokens, and lease IDs are not printed.
