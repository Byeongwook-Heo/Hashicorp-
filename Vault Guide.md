# Hashicorp-

## Vault 초기 설치부터 CLI/UI/HTTP API까지 (공식 문서 기반 상세 가이드)

이 문서는 HashiCorp Vault **공식 문서(설치, get started 튜토리얼)** 흐름을 따라,
처음 설치하는 단계부터 `init/unseal`, 토큰/정책/역할(Role), CLI/UI/API 사용까지 한 번에 실습할 수 있게 정리한 가이드입니다.

> 범위: 로컬 학습/검증 환경 중심
> 
> 운영(Production)에서는 **TLS, 자동 언실(Cloud KMS/HSM), 외부 스토리지(Integrated Storage/Raft 포함), 감사 로깅, 백업/복구 전략**을 반드시 추가하세요.

---

## 0) 사전 개념: Vault에서 꼭 알아야 할 4가지

1. **Seal / Unseal**  
   Vault는 시작 시 봉인(Seal) 상태이며, 언실(Unseal) 과정을 거쳐야 비밀 저장소에 접근 가능합니다.
2. **초기화(Init)**  
   최초 1회 `vault operator init`으로 언실 키(Unseal Key)와 초기 루트 토큰(Root Token)을 생성합니다.
3. **인증(AuthN)과 인가(AuthZ)**  
   로그인(토큰 발급)은 인증, 토큰이 할 수 있는 범위는 정책(Policy)으로 제한합니다.
4. **Secret Engine**  
   KV, Database, PKI 등 비밀 관리 백엔드를 마운트해 사용합니다. 입문은 보통 KV v2부터 시작합니다.

---

## 1) Vault 설치

### 1-1) Linux(Ubuntu/Debian) 설치

```bash
sudo apt-get update && sudo apt-get install -y gpg wget
wget -O- https://apt.releases.hashicorp.com/gpg | \
  gpg --dearmor | \
  sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg > /dev/null
gpg --no-default-keyring \
  --keyring /usr/share/keyrings/hashicorp-archive-keyring.gpg \
  --fingerprint

echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/hashicorp.list

sudo apt-get update
sudo apt-get install -y vault
vault version
```

### 1-2) macOS(Homebrew) 설치

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/vault
vault version
```

---

## 2) 빠른 시작: Dev 모드로 CLI 감 잡기

> Dev 모드는 학습용입니다. 자동 언실/인메모리 스토리지 등으로 운영에 부적합합니다.

터미널 A:

```bash
vault server -dev
```

출력에서 Root Token이 표시됩니다. 같은 터미널 또는 터미널 B에서:

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
vault login <DEV_ROOT_TOKEN>
vault status
```

기본 동작 확인(KV v2):

```bash
vault kv put secret/demo username="appuser" password="p@ssw0rd"
vault kv get secret/demo
vault kv metadata get secret/demo
```

---

## 3) 일반 모드(운영 유사)로 서버 기동 + 초기화/언실

### 3-1) 최소 설정 파일 작성

`config.hcl` 예시:

```hcl
ui = true

disable_mlock = true

listener "tcp" {
  address     = "127.0.0.1:8200"
  tls_disable = 1
}

storage "file" {
  path = "./vault-data"
}

api_addr = "http://127.0.0.1:8200"
cluster_addr = "http://127.0.0.1:8201"
```

서버 시작:

```bash
vault server -config=config.hcl
```

### 3-2) 환경 변수

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
```

### 3-3) 초기화(init)

```bash
vault operator init -key-shares=5 -key-threshold=3
```

- Unseal Key 1~5와 Initial Root Token이 출력됩니다.
- **반드시 안전한 장소(오프라인/암호화 저장소)에 분산 보관**하세요.

### 3-4) 언실(unseal)

3개 키를 순서대로 입력:

```bash
vault operator unseal <KEY_1>
vault operator unseal <KEY_2>
vault operator unseal <KEY_3>
```

상태 확인:

```bash
vault status
```

### 3-5) 루트 토큰 로그인

```bash
vault login <INITIAL_ROOT_TOKEN>
vault token lookup
```

---

## 4) 토큰(Token) 이해와 실습

Vault 접근은 토큰 중심입니다. 토큰에는 TTL, 갱신 가능 여부, 정책이 붙습니다.

### 4-1) 토큰 생성

```bash
vault token create -display-name="ops-session" -ttl=1h
```

정책을 부여해 생성:

```bash
vault token create -policy=default -ttl=30m
```

### 4-2) 토큰 조회/갱신/폐기

```bash
vault token lookup
vault token renew
vault token revoke <TOKEN>
```

운영 팁:
- 장기 루트 토큰 상시 사용 금지
- 사람/서비스 계정 목적별 정책 분리
- TTL 짧게, 필요 시 주기적으로 재발급/갱신

---

## 5) 정책(Policy) 작성과 적용

정책은 HCL 또는 JSON으로 작성합니다.

`app-readonly.hcl`:

```hcl
path "secret/data/app/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/app/*" {
  capabilities = ["read", "list"]
}
```

정책 등록:

```bash
vault policy write app-readonly app-readonly.hcl
vault policy read app-readonly
```

해당 정책으로 토큰 발급:

```bash
vault token create -policy=app-readonly -ttl=1h
```

검증 시나리오:
1. `secret/app/config` 읽기 성공
2. 같은 토큰으로 `vault kv put` 시도 시 거부(권한 없음) 확인

---

## 6) 역할(Role) 개념과 토큰 발급 연결

튜토리얼에서의 Role은 주로 **토큰 역할(token role)** 또는 각 Auth Method의 role로 등장합니다.

### 6-1) 토큰 역할 생성

```bash
vault write auth/token/roles/app-role \
  allowed_policies="app-readonly" \
  orphan=true \
  renewable=true \
  token_ttl=20m \
  token_max_ttl=2h
```

이 role 기반 토큰 발급:

```bash
vault token create -role=app-role
```

장점:
- 토큰 생성 규칙(TTL/정책/속성)을 role에 표준화
- 팀/서비스별 발급 기준 일관성 확보

---

## 7) CLI 실습: KV v2 전체 흐름

### 7-1) KV v2 엔진 활성화(필요 시)

```bash
vault secrets enable -path=secret kv-v2
```

(이미 존재하면 에러가 날 수 있음)

### 7-2) 시크릿 쓰기/읽기

```bash
vault kv put secret/app/config db_user="vaultuser" db_pass="vaultpass"
vault kv get secret/app/config
```

### 7-3) 버전 확인/삭제/복구

```bash
vault kv metadata get secret/app/config
vault kv delete secret/app/config
vault kv undelete -versions=1 secret/app/config
vault kv destroy -versions=1 secret/app/config
```

---

## 8) UI 실습 포인트

브라우저에서 `http://127.0.0.1:8200` 접속:

1. Token 방식으로 로그인
2. `Secrets`에서 `secret/` 엔진 진입
3. `app/config` 생성 및 버전 확인
4. `Access` 메뉴에서 Policy/Token 관리

UI에서 보이는 경로와 CLI 경로(`secret/data/...`, `secret/metadata/...`) 차이를 함께 이해하면 운영 시 실수가 줄어듭니다.

---

## 9) HTTP API 실습 (CLI와 1:1 대응)

토큰 환경 변수 설정:

```bash
export VAULT_TOKEN='<YOUR_TOKEN>'
```

### 9-1) 시크릿 쓰기 (KV v2)

```bash
curl \
  --header "X-Vault-Token: $VAULT_TOKEN" \
  --request POST \
  --data '{"data": {"username": "api-user", "password": "api-pass"}}' \
  $VAULT_ADDR/v1/secret/data/api-demo
```

### 9-2) 시크릿 읽기

```bash
curl \
  --header "X-Vault-Token: $VAULT_TOKEN" \
  $VAULT_ADDR/v1/secret/data/api-demo
```

### 9-3) 정책 등록(API)

```bash
curl \
  --header "X-Vault-Token: $VAULT_TOKEN" \
  --request PUT \
  --data '{"policy":"path \"secret/data/api-demo\" { capabilities = [\"read\"] }"}' \
  $VAULT_ADDR/v1/sys/policies/acl/api-readonly
```

---

## 10) 자주 겪는 문제와 점검 순서

1. `connection refused`  
   - `VAULT_ADDR` 값 확인
   - 서버 바인딩 주소/포트 확인
2. `permission denied`  
   - 현재 토큰 정책 확인: `vault token lookup`
   - KV v2 정책 경로(`data/`, `metadata/`) 확인
3. `sealed` 상태  
   - `vault status`에서 `Sealed true` 확인 후 unseal 재수행
4. TTL 만료  
   - 토큰 재로그인 또는 갱신(`vault token renew`)

---

## 11) 운영 전환 체크리스트 (중요)

- TLS 비활성(`tls_disable = 1`) 설정 제거
- `disable_mlock` 기본 보안 정책 검토
- 스토리지 고가용성(Integrated Storage/Raft 포함) 설계
- Auto Unseal(KMS/HSM) 검토
- 감사 로그(audit device) 활성화
- 루트 토큰 금고 보관 + 브레이크글라스 절차 문서화
- 정책 최소권한 원칙과 정기 검토
- 백업/복구/DR 리허설

---

## 12) 학습 순서 추천 (공식 튜토리얼 매핑)

1. 설치 및 서버 기동 (Install, Setup)
2. 토큰 기초 (Introduction to Tokens)
3. 정책 작성 (Introduction to Policies)
4. 역할 기반 발급 (Introduction to Roles)
5. CLI 사용법 정리 (Learn CLI)
6. UI 동선 숙지 (Learn UI)
7. API 호출 패턴 숙달 (Learn HTTP API)

이 순서대로 진행하면, “로그인/권한/비밀 저장/자동화”까지 Vault 핵심 운영 개념을 빠르게 연결할 수 있습니다.
