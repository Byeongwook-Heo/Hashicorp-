# Troubleshooting

## Endpoint returns 503

Check ECS running/pending counts and target health. A new task can take one to two minutes to register. If the task stops, inspect the ECS stopped reason and `/aws/ecs/bob-vault-nhi-demo` without printing environment secrets.

## Vault is unreachable

Confirm the instance is SSM Online, the private DNS record resolves in the VPC, security group 8200 allows only ECS and bootstrap CodeBuild, and `/bob-vault-nhi-demo/vault/ca-pem` contains a PEM certificate.

## Vault is sealed

Check the instance role's decrypt permission on `alias/bob-vault-nhi-demo-vault-unseal`. Do not attempt manual unseal key distribution; this deployment uses AWS KMS auto-unseal.

## Verify rejects the client assertion

Check RS256, registered `kid`, client ID in `iss`/`sub`, exact token endpoint in `aud`, 60-second expiry, and unique `jti`. Do not print the assertion.

## Vault JWT login is denied

Compare Verify issuer, access-token audience, NHI claim name/value, and Vault namespace `demo`. The role must be `bob-orders`.

## Database dynamic user fails

Confirm `shop-postgres`, role `bob-orders-readonly`, group `bob_orders_reader`, view `v_bob_order_status`, RDS CA, and TLS hostname verification.

## Bob cannot connect

Check the laptop/VPN public egress CIDR, Bob's bearer header, MCP URL, and Streamable HTTP type. `alwaysAllow` should remain empty.
