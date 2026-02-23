# Hashicorp-

## Vault 초기 세팅 가이드

이 문서는 **개발/테스트 환경 기준**으로 HashiCorp Vault를 처음 설치하고 사용할 때 필요한 최소 절차를 정리한 가이드입니다.

> 운영(Production) 환경에서는 반드시 TLS, Auto Unseal(KMS/HSM), 스토리지 고가용성(Raft 클러스터), 접근제어 정책 분리 등을 함께 적용하세요.

---

### 1) Vault 설치

#### macOS (Homebrew)
```bash
brew tap hashicorp/tap
brew install hashicorp/tap/vault
vault --version
```

#### Ubuntu/Debian (APT)
```bash
sudo apt-get update && sudo apt-get install -y gpg lsb-release
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install -y vault
vault --version
```

---

### 2) 개발 모드로 빠르게 실행(학습용)

개발 모드는 실습에 편하지만, 데이터가 휘발되고 보안 설정이 약합니다.

```bash
vault server -dev
```

실행 후 출력되는 `Root Token`을 복사해 둡니다.

다른 터미널에서 아래 환경변수를 설정합니다.

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<dev-root-token>'
```

상태 확인:

```bash
vault status
```

---

### 3) 로컬 파일 기반 서버로 초기화/언실(개발 심화)

아래는 개발 모드가 아닌 일반 실행 예시입니다.

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

실행:

```bash
vault server -config=config.hcl
```

초기화(최초 1회):

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
vault operator init -key-shares=5 -key-threshold=3
```

출력되는 **Unseal Key**와 **Initial Root Token**은 안전하게 보관합니다.

언실(서버 재기동 시 필요):

```bash
vault operator unseal <unseal-key-1>
vault operator unseal <unseal-key-2>
vault operator unseal <unseal-key-3>
```

로그인:

```bash
vault login <initial-root-token>
```

---

### 4) KV 시크릿 엔진 설정 및 테스트

KV v2 활성화:

```bash
vault secrets enable -path=secret kv-v2
```

시크릿 저장:

```bash
vault kv put secret/myapp DB_USER="appuser" DB_PASS="s3cr3t!"
```

시크릿 조회:

```bash
vault kv get secret/myapp
```

---

### 5) 최소 정책/토큰 분리(권장)

`myapp-read.hcl`:

```hcl
path "secret/data/myapp" {
  capabilities = ["read"]
}
```

정책 등록:

```bash
vault policy write myapp-read myapp-read.hcl
```

정책 기반 토큰 발급:

```bash
vault token create -policy=myapp-read -ttl=24h
```

---

### 6) 자주 쓰는 점검 명령어

```bash
vault status
vault secrets list
vault auth list
vault token lookup
```

---

### 7) 운영 환경 전환 체크리스트

- TLS 활성화 (`tls_disable = 0`, 인증서 구성)
- Raft/Consul 등 내구성 있는 스토리지 구성
- Auto Unseal(KMS/HSM) 적용
- Root Token 상시 사용 금지, 최소권한 정책 분리
- 감사 로그(Audit Device) 활성화
- 백업/복구 리허설 수행

필요하면 다음 단계로 Kubernetes(Auth Method), AppRole, Dynamic Secrets(DB/Cloud)까지 확장 가이드를 추가할 수 있습니다.


---

### 8) 시나리오 구성 가이드(상세)

Vault 학습/도입 문서는 **명령어 나열형**보다, 실제 사용 흐름을 반영한 **시나리오 중심 구조**로 작성하면 이해와 재현성이 크게 높아집니다.

#### 8-1. 시나리오 문서 기본 템플릿

각 시나리오는 아래 7개 요소를 고정으로 포함하세요.

1. **목표(Why)**: 이 시나리오로 무엇을 달성하는지 1~2문장으로 명확히 기술
2. **전제조건(Prerequisites)**: Vault 버전, OS, 필요한 권한, 사전 생성 리소스
3. **구성요소(Architecture)**: 인증 방식, 시크릿 엔진, 정책, 토큰 수명
4. **절차(Steps)**: 실행 가능한 명령어를 순서대로 제시
5. **검증(Validation)**: 성공/실패 판단 기준과 확인 명령
6. **장애 대응(Troubleshooting)**: 자주 발생하는 오류와 원인/조치
7. **운영 반영(Production Notes)**: 개발 예제를 운영으로 바꿀 때 체크할 항목

> 권장 형식: `목표 → 준비 → 실행 → 검증 → 복구/정리` 흐름을 모든 시나리오에서 동일하게 유지

#### 8-2. 난이도별 시나리오 로드맵

초급부터 고급까지 단계적으로 배치하면 학습 곡선이 자연스럽습니다.

- **입문(Scenario A)**: Dev Server 실행, KV 저장/조회
- **기초 보안(Scenario B)**: 정책 생성, 읽기 전용 토큰 분리
- **애플리케이션 연동(Scenario C)**: AppRole 또는 Kubernetes Auth로 앱 인증
- **고급 보안(Scenario D)**: Dynamic Secrets(DB/Cloud) 발급 및 만료 검증
- **운영 안정성(Scenario E)**: Audit 로그, 백업/복구, 장애 복원 리허설

각 단계는 이전 단계 산출물(정책/경로/역할)을 재사용하도록 구성하면 중복 설명을 줄일 수 있습니다.

#### 8-3. 시나리오 작성 규칙(재현성 중심)

- **명령어는 그대로 복붙 가능**해야 합니다.
- 예시 값(`myapp`, `secret/myapp`)은 문서 전체에서 **일관된 네이밍**을 사용하세요.
- 명령 실행 전 필요한 환경변수는 매 시나리오 시작에 다시 명시하세요.
- 출력 예시는 핵심 필드(`sealed`, `token`, `lease_duration`) 중심으로 최소화하세요.
- 실패 케이스를 최소 1개 포함해 “정상/비정상” 차이를 보여주세요.

#### 8-4. 상세 예시 시나리오(정책 분리 + 앱 접근)

아래 예시는 개발 환경에서 가장 자주 쓰는 패턴입니다.

##### 목표
앱 전용 경로(`secret/myapp`)에 대해 읽기만 가능한 토큰을 발급하고, 루트 토큰 없이 시크릿을 조회합니다.

##### 준비
```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<root-or-admin-token>'
```

##### 실행 1: KV 및 데이터 준비
```bash
vault secrets enable -path=secret kv-v2 || true
vault kv put secret/myapp DB_USER='appuser' DB_PASS='s3cr3t!'
```

##### 실행 2: 읽기 전용 정책 작성
`myapp-read.hcl`
```hcl
path "secret/data/myapp" {
  capabilities = ["read"]
}
```

```bash
vault policy write myapp-read myapp-read.hcl
```

##### 실행 3: 앱 토큰 발급
```bash
vault token create -policy=myapp-read -ttl=1h
```

출력된 토큰을 별도 셸에 적용:
```bash
export VAULT_TOKEN='<app-token>'
```

##### 검증
```bash
vault kv get secret/myapp
```

성공 기준:
- `DB_USER`, `DB_PASS` 필드가 조회됨
- `token policies`에 `myapp-read` 포함

##### 실패 검증(권한 테스트)
```bash
vault kv put secret/myapp NEW_KEY='blocked'
```

기대 결과:
- `permission denied` 오류 발생(읽기 전용 정책이 정상 동작)

##### 정리
```bash
# 발급 토큰 폐기(루트/관리자 토큰으로 실행)
vault token revoke <app-token>
```

#### 8-5. 운영 전환용 시나리오 보강 포인트

개발 시나리오를 운영으로 전환할 때는 아래 항목을 반드시 추가하세요.

- 인증: Root Token 대신 AppRole/Kubernetes/JWT 기반 인증으로 교체
- 통신: TLS 강제 및 인증서 갱신 절차 문서화
- 가용성: 단일 파일 스토리지에서 Raft HA 구조로 전환
- 키 관리: 수동 언실에서 Auto Unseal(KMS/HSM)로 전환
- 감사/추적: Audit Device 활성화 + 접근 로그 보존 정책 수립
- 복구: 백업 주기, 복구 RTO/RPO, 정기 복구 훈련 시나리오 포함

---

위 템플릿을 기준으로 시나리오를 쌓아가면, 단순 실습 문서를 넘어 **팀 온보딩/운영 런북**으로 바로 확장할 수 있습니다.


#### 8-6. Failover 테스트 시나리오(리더 장애 전환 검증)

운영 관점에서 반드시 필요한 검증은 **리더 장애 발생 시 서비스 연속성**입니다. 아래 시나리오는 Raft HA 구성을 기준으로 작성합니다.

##### 목표
현재 리더 노드를 중단했을 때, 팔로워가 새로운 리더로 승격되고 읽기/쓰기 요청이 정상 처리되는지 확인합니다.

##### 전제조건
- Vault 3노드 이상(Raft Integrated Storage)
- 각 노드 API 접근 가능(`VAULT_ADDR` 변경 가능)
- 운영과 유사한 정책/시크릿 엔진 사전 구성

##### 준비
```bash
export VAULT_ADDR='https://vault-node-1.example.com:8200'
export VAULT_TOKEN='<ops-admin-token>'
```

현재 리더 확인:
```bash
vault operator raft list-peers
```

##### 실행 1: 기준 데이터 기록
```bash
vault kv put secret/failover-check ts="$(date +%s)" source='before-failover'
```

##### 실행 2: 리더 장애 유도
아래는 예시이며 실제 운영에서는 표준 운영 절차(점검 창, 승인, 알림)에 맞춰 수행하세요.
```bash
# 예: 리더 노드에서 Vault 프로세스 중단
# sudo systemctl stop vault
```

##### 실행 3: 신규 리더 선출 확인
남은 노드 주소로 `VAULT_ADDR`를 바꿔 확인:
```bash
export VAULT_ADDR='https://vault-node-2.example.com:8200'
vault status
vault operator raft list-peers
```

##### 검증
장애 전환 후 읽기/쓰기 확인:
```bash
vault kv get secret/failover-check
vault kv put secret/failover-check ts="$(date +%s)" source='after-failover'
```

성공 기준:
- `raft list-peers`에서 리더가 다른 노드로 변경됨
- `kv get` 성공(기존 데이터 일관성 유지)
- `kv put` 성공(쓰기 가용성 확보)

##### 장애 대응 포인트
- 리더 선출 지연 시: 네트워크 지연, 쿼럼(과반) 미충족 여부 확인
- 쓰기 실패 시: 토큰 정책/TTL, 노드 시간 동기화(NTP), 스토리지 상태 확인

##### 운영 반영
- RTO(복구 시간 목표), 리더 선출 평균 시간, 실패율을 지표로 수집
- 분기별 GameDay 형태로 동일 시나리오 리허설

#### 8-7. DB 연결 시나리오(동적 크리덴셜 발급)

정적 DB 비밀번호를 코드/환경변수에 고정하지 않고, Vault가 **짧은 수명의 DB 계정**을 발급하도록 구성하는 시나리오입니다.

##### 목표
`database` 시크릿 엔진을 통해 애플리케이션이 TTL 기반 DB 자격증명을 받아 접속하고, 만료/재발급 흐름을 검증합니다.

##### 전제조건
- PostgreSQL/MySQL 등 대상 DB 접근 가능
- Vault에서 DB 관리자 계정으로 초기 연결 가능
- 애플리케이션 또는 테스트 클라이언트에서 동적 계정으로 접속 가능

##### 준비
```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<root-or-admin-token>'
```

##### 실행 1: database 시크릿 엔진 활성화
```bash
vault secrets enable database || true
```

##### 실행 2: DB 커넥션 등록(PostgreSQL 예시)
```bash
vault write database/config/my-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="myapp-db-role" \
  connection_url="postgresql://{{username}}:{{password}}@127.0.0.1:5432/postgres?sslmode=disable" \
  username="vaultadmin" \
  password="vaultadminpassword"
```

##### 실행 3: 동적 계정 생성 Role 정의
```bash
vault write database/roles/myapp-db-role \
  db_name=my-postgres \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"
```

##### 실행 4: 동적 크리덴셜 발급
```bash
vault read database/creds/myapp-db-role
```

출력에서 `username`, `password`, `lease_duration`을 확인합니다.

##### 검증
발급받은 계정으로 DB 로그인 테스트(예: psql):
```bash
psql "host=127.0.0.1 port=5432 dbname=postgres user=<dynamic-username> password=<dynamic-password> sslmode=disable" -c "SELECT now();"
```

성공 기준:
- 쿼리 성공
- Lease TTL 내 정상 사용 가능

##### 만료/재발급 검증
- TTL 만료 후 동일 계정 접속 실패 확인
- Vault 재호출로 새 계정 발급 및 재접속 성공 확인

##### 운영 반영
- 앱은 자격증명을 캐시하되, TTL 70~80% 시점에 사전 갱신
- DB 권한은 최소권한(`SELECT`, 특정 스키마)으로 제한
- 폐기(revoke) 실패 대비 정리 배치(job)와 감사 로그 대조 절차 마련
