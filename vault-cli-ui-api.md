# Vault CLI, UI, HTTP API Quick Reference

## 목적

`vault-guide.md`의 설치·초기화·시나리오 설명과 중복되지 않도록, Vault를 CLI·UI·HTTP API로 다룰 때 필요한 인터페이스별 핵심 동작만 정리합니다.

## Token 수명주기

```bash
vault token create -display-name="ops-session" -ttl=1h
vault token lookup
vault token renew
vault token revoke <TOKEN>
```

운영에서는 장기 Root Token 사용을 피하고, 사람과 서비스 계정의 정책 및 TTL을 분리합니다.

## Token Role

```bash
vault write auth/token/roles/app-role \
  allowed_policies="app-readonly" \
  orphan=true \
  renewable=true \
  token_ttl=20m \
  token_max_ttl=2h

vault token create -role=app-role
```

Role을 사용하면 발급 토큰의 정책, TTL, 갱신 여부 같은 규칙을 표준화할 수 있습니다.

## CLI: KV v2

```bash
vault secrets enable -path=secret kv-v2
vault kv put secret/app/config db_user="vaultuser" db_pass="vaultpass"
vault kv get secret/app/config
vault kv metadata get secret/app/config
vault kv delete secret/app/config
vault kv undelete -versions=1 secret/app/config
vault kv destroy -versions=1 secret/app/config
```

KV v2 정책에서는 CLI 경로와 실제 API 경로가 다를 수 있으므로 `secret/data/...`, `secret/metadata/...` 구분을 확인합니다.

## UI

브라우저에서 Vault UI에 접속한 뒤 다음 흐름을 확인합니다.

1. Token 또는 구성된 Auth Method로 로그인
2. `Secrets`에서 대상 Secret Engine 진입
3. KV v2 데이터 생성 및 버전 확인
4. 권한이 허용된 관리 화면에서 Policy·Auth·Identity 설정 확인

UI에서 보이는 논리 경로와 HTTP API의 `data/`, `metadata/` 경로를 혼동하지 않는 것이 중요합니다.

## HTTP API: KV v2

```bash
export VAULT_TOKEN='<YOUR_TOKEN>'

curl \
  --header "X-Vault-Token: $VAULT_TOKEN" \
  --request POST \
  --data '{"data":{"username":"api-user","password":"api-pass"}}' \
  "$VAULT_ADDR/v1/secret/data/api-demo"

curl \
  --header "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/secret/data/api-demo"
```

Policy 등록 예시:

```bash
curl \
  --header "X-Vault-Token: $VAULT_TOKEN" \
  --request PUT \
  --data '{"policy":"path \"secret/data/api-demo\" { capabilities = [\"read\"] }"}' \
  "$VAULT_ADDR/v1/sys/policies/acl/api-readonly"
```

## 빠른 문제 확인

- `connection refused`: `VAULT_ADDR`, listener 주소와 포트 확인
- `permission denied`: 현재 Token Policy와 KV v2 `data/metadata` 경로 확인
- `Sealed true`: Seal 상태와 Unseal/Auto Unseal 상태 확인
- TTL 만료: 재인증 또는 갱신 가능 여부 확인

## 관련 문서

- [Vault 학습 및 시나리오 가이드](vault-guide.md)
- [Vault 업그레이드 Runbook](vault-upgrade-runbook.md)
