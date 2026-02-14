# HashiCorp Vault 가이드

마지막 업데이트: 2026-02-14

## 1) Vault 한눈에 이해

- Vault는 비밀(암호, API키, 인증서, DB 계정) 및 민감 데이터의 저장·암호화·권한제어·감사 로깅을 담당하는 시스템입니다.
- 핵심 구성요소
  - **Storage**: 암호화된 비밀, 정책, 상태를 영구 저장
  - **Seal/Unseal**: 마스터 키를 분산해 저장소를 보호
  - **Auth Methods**: 사용자/애플리케이션을 Vault ID로 인증하는 방식
  - **Secret Engines**: 비밀 저장/생성 기능(예: KV, AWS, DB, PKI)
  - **Policies**: 경로(Path) 기반 권한 정책

## 2) 설치

### 2-1) macOS (Homebrew)

```bash
brew install hashicorp/tap/vault
vault -v
```

### 2-2) Linux (공식 패키지/ZIP)

- https://developer.hashicorp.com/vault/downloads 참고해 OS/arch별 패키지 설치
- 바이너리 권한 설정
  ```bash
  chmod +x vault
  sudo mv vault /usr/local/bin/
  vault -v
  ```

## 3) 실행 모드

### 3-1) 빠른 실습: dev mode

```bash
vault server -dev -dev-root-token-id="root"
```

- 개발/테스트 전용
- 데이터 영구 보존 안 됨, 보안 기능이 단순화됨

### 3-2) 운영 권장: production mode

- 고가용성, 영구 스토리지(예: Consul, S3, Raft), TLS 적용 필요
- 최소 구성 예시
  - TLS 인증서 적용
  - 스토리지 백엔드 구성
  - 로그 및 감사(audit) 활성화
  - 정책 기반 접근 통제

## 4) 초기화 및 Unseal(운영에서 중요)

### 4-1) 초기화

```bash
vault operator init -key-shares=5 -key-threshold=3 -format=json
```

- 출력의 `unseal_keys_b64` 5개 중 3개를 분산 보관(예: 금고/비밀 분산 저장)
- `initial_root_token`은 별도 안전한 저장소에 보관

### 4-2) Unseal

```bash
vault operator unseal <unseal_key_1>
vault operator unseal <unseal_key_2>
vault operator unseal <unseal_key_3>
```

- 최소 3개의 키가 들어가면 Vault가 열림

## 5) 환경 변수 및 로그인

```bash
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=<토큰>
vault status
```

- 운영은 HTTPS/TLS 필수 (`VAULT_ADDR=https://vault.example.com:8200`)

## 6) 인증(Auth) 구성 예시

### 6-1) Root token은 운영에서 사용 X

- 초기 작업 후 즉시 비활성/폐기하고, 접근은 AppRole/LDAP/OIDC/JWT 등으로 분리

### 6-2) AppRole 기본 흐름

1. AppRole 엔진 활성화
2. Role 생성
3. `role_id`, `secret_id` 발급
4. 앱에서 `role_id/secret_id`로 로그인

## 7) Secret Engine(KV v2) 기본 사용

### 7-1) KV v2 활성화

```bash
vault secrets enable -path=secret kv-v2
```

### 7-2) 값 쓰기/읽기

```bash
vault kv put secret/myapp/config api_key=abcd1234 db_pass=supersecret
vault kv get secret/myapp/config
vault kv delete secret/myapp/config
```

## 8) Policy(권한) 기본

```bash
# 정책 예시 파일: app.hcl
# path "secret/data/myapp/*" {
#   capabilities = ["create", "read", "update", "delete", "list"]
# }
```

```bash
vault policy write myapp-policy app.hcl
vault token create -policy=myapp-policy
```

## 9) 감사(audit) 및 로깅

- Vault 감사는 모든 접근 시도를 추적
- 파일 로그 예시
  ```bash
  vault audit enable file file_path=/var/log/vault_audit.log log_raw=true
  vault audit list
  ```

## 10) 운영 체크리스트 (반드시 확인)

- TLS 활성화 (`https`, 유효한 인증서)
- 최소 권한 원칙(Least Privilege) 정책
- Vault token TTL/renewal/periodic 제한
- root token 분리 보관 및 사용 제한
- 자동 백업: Storage snapshot/영속성 데이터 정기 백업
- 모니터링: `vault status`, 응답 지연, 실패율, unseal 상태
- 장애 대응: 자동화된 unseal(키 관리 서비스 연동), DR 복구(runbooks)

## 11) 백업/복구 요약

- 스토리지(raft/consul/s3 등) 백업 계획 수립
- `seal/unseal` 키는 최소 2개 이상의 보관 체계로 분산
- `initial_root_token` 유실 방지 정책 필수
- 정기 복구 드릴: 복구 절차를 사전에 테스트

## 12) 자주 쓰는 명령 모음

```bash
vault status                  # 상태
vault login <token>           # 토큰 로그인
vault kv list secret/          # 경로 목록
vault token create -policy=<policy>
vault token lookup             # 토큰 정보 조회
vault operator raft list-peers # Raft 클러스터 상태(해당 구성 시)
```

## 13) 참고 문서

- Vault 공식 문서: https://developer.hashicorp.com/vault
- API 가이드: https://developer.hashicorp.com/vault/api-docs
- 보안 모범사례: https://developer.hashicorp.com/vault/docs/concepts
