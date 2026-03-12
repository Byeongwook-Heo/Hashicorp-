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


