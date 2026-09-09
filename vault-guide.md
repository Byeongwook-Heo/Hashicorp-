# Vault Guide

Vault 설치부터 기본 사용, 정책 분리, 운영 검증 시나리오까지 이어지는 **기준 문서**입니다.

> 범위: 개발·테스트 및 운영 준비용 예제. 운영 환경에서는 TLS, Auto Unseal(KMS/HSM), Raft HA, 최소권한 정책, 감사 로그, 백업·복구와 변경관리 절차를 별도로 검토해야 합니다.

## 1. Vault 설치

### macOS

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/vault
vault version
```

### Ubuntu/Debian

```bash
sudo apt-get update && sudo apt-get install -y gpg lsb-release
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install -y vault
vault version
```

## 2. Dev Mode로 빠르게 확인

```bash
vault server -dev
```

다른 터미널에서:

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<dev-root-token>'
vault status
```

Dev Mode는 학습용이며 운영에 사용하지 않습니다.

## 3. 일반 모드 초기화와 Unseal

`config.hcl` 예시:

```hcl
storage "file" {
  path = "./vault-data"
}

listener "tcp" {
  address     = "127.0.0.1:8200"
  tls_disable = 1
}

disable_mlock = true
ui = true
```

```bash
vault server -config=config.hcl
export VAULT_ADDR='http://127.0.0.1:8200'
vault operator init -key-shares=5 -key-threshold=3
vault operator unseal <unseal-key-1>
vault operator unseal <unseal-key-2>
vault operator unseal <unseal-key-3>
vault login <initial-root-token>
```

Unseal Key와 Initial Root Token은 안전한 절차로 보관합니다.

## 4. KV v2와 최소권한 정책

```bash
vault secrets enable -path=secret kv-v2
vault kv put secret/myapp DB_USER="appuser" DB_PASS="s3cr3t!"
vault kv get secret/myapp
```

`myapp-read.hcl`:

```hcl
path "secret/data/myapp" {
  capabilities = ["read"]
}
```

```bash
vault policy write myapp-read myapp-read.hcl
vault token create -policy=myapp-read -ttl=1h
```

쓰기 권한이 없는 Token으로 `vault kv put`을 시도해 `permission denied`가 발생하는지 확인합니다.

## 5. 기본 점검 명령

```bash
vault status
vault secrets list
vault auth list
vault token lookup
```

Token Role, UI, HTTP API와 KV v2 인터페이스별 경로는 [Vault CLI / UI / HTTP API Quick Reference](vault-cli-ui-api.md)를 참고하세요.

## 6. 시나리오 문서 작성 기준

실습이나 고객 검증 문서는 다음 순서를 일관되게 유지합니다.

1. **목표** — 무엇을 검증하는지
2. **전제조건** — 버전, 권한, 네트워크, 외부 시스템
3. **구성요소** — Auth Method, Secret Engine, Policy, TTL
4. **절차** — 실행 가능한 명령
5. **검증** — 성공·실패 기준
6. **장애 대응** — 주요 오류와 조치
7. **운영 반영** — Production에서 추가할 통제

권장 흐름은 `목표 → 준비 → 실행 → 검증 → 복구/정리`입니다.

## 7. 시나리오 A — 읽기 전용 애플리케이션 접근

### 목표

앱 전용 경로 `secret/myapp`에 읽기만 가능한 Token을 발급하고 Root Token 없이 조회합니다.

### 준비

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<root-or-admin-token>'
vault secrets enable -path=secret kv-v2 || true
vault kv put secret/myapp DB_USER='appuser' DB_PASS='s3cr3t!'
```

### Policy

```hcl
path "secret/data/myapp" {
  capabilities = ["read"]
}
```

```bash
vault policy write myapp-read myapp-read.hcl
vault token create -policy=myapp-read -ttl=1h
```

발급 Token을 적용한 뒤:

```bash
vault kv get secret/myapp
vault kv put secret/myapp NEW_KEY='blocked'
```

성공 기준:

- `kv get` 성공
- 쓰기는 `permission denied`

## 8. 시나리오 B — Raft Leader Failover

### 목표

3노드 이상 Raft HA에서 Leader 장애 후 새로운 Leader가 선출되고 읽기·쓰기가 계속되는지 검증합니다.

### 전제조건

- Vault 3노드 이상
- Raft Integrated Storage
- 운영과 유사한 Policy와 Secret Engine
- 각 노드 또는 Load Balancer API 접근 가능

### 기준 데이터 생성

```bash
vault operator raft list-peers
vault kv put secret/failover-check ts="$(date +%s)" source='before-failover'
```

변경관리 절차에 따라 현재 Leader의 Vault 프로세스를 중지한 뒤 남은 노드에서 확인합니다.

```bash
vault status
vault operator raft list-peers
vault kv get secret/failover-check
vault kv put secret/failover-check ts="$(date +%s)" source='after-failover'
```

성공 기준:

- 새로운 Leader 선출
- 장애 전 데이터 조회 성공
- 장애 후 쓰기 성공

운영에서는 Leader 선출 시간, API 오류율, RTO를 함께 기록합니다.

## 9. 시나리오 C — Database Dynamic Credentials

### 목표

애플리케이션이 정적 DB 비밀번호 대신 Vault에서 TTL 기반 PostgreSQL 자격증명을 발급받도록 구성합니다.

### 설정

```bash
vault secrets enable database || true

vault write database/config/my-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="myapp-db-role" \
  connection_url="postgresql://{{username}}:{{password}}@127.0.0.1:5432/postgres?sslmode=disable" \
  username="vaultadmin" \
  password="vaultadminpassword"

vault write database/roles/myapp-db-role \
  db_name=my-postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

vault read database/creds/myapp-db-role
```

검증 시 발급된 `username`, `password`, `lease_duration`을 확인하고 실제 DB 접속을 테스트합니다. 운영에서는 DB 권한을 최소화하고 Lease 만료·Revoke 실패 시 정리 절차를 별도로 둡니다.

## 10. 운영 전환 체크리스트

- TLS 강제 및 인증서 갱신 절차
- Raft HA와 Snapshot/복구 검증
- Auto Unseal(KMS/HSM)
- Root Token 비상 절차와 최소 사용
- AppRole/Kubernetes/JWT/OIDC 등 목적별 인증
- 최소권한 Policy와 정기 검토
- Audit Device와 로그 보존
- Backup/Restore 및 DR GameDay
- Token/Lease TTL 및 갱신 전략
- 모니터링, Alerting, 용량·성능 기준

## 관련 문서

- [Vault CLI / UI / HTTP API Quick Reference](vault-cli-ui-api.md)
- [Vault Upgrade Runbook](vault-upgrade-runbook.md)
