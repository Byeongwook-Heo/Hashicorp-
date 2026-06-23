# HashiCorp Enterprise AWS Lab 구성도

작성일: 2026-06-23

## 1. 전체 운영 흐름

```mermaid
flowchart TB
  DEV["작업자 MacBook"]
  GH["GitHub Repository: Byeongwook-Heo/Hashicorp-"]
  BR["Branch: codex/enterprise-aws-lab"]
  HCP["HCP Terraform Workspace: hashicorp_lab-enterprise-dev"]
  STATE["HCP Terraform Remote State"]
  LOCAL["Local Execution: envs/dev"]
  AWSAPI["AWS API: ap-northeast-2"]
  AGENT["Bootstrap EC2 HCP Agent: i-070379b67ec9730c1"]

  DEV -->|"git push"| GH
  GH --> BR
  BR -->|"Terraform code"| HCP
  HCP --> STATE
  DEV -->|"terraform apply"| LOCAL
  LOCAL --> STATE
  LOCAL --> AWSAPI
  AGENT -. "별도 agent pool idle" .-> HCP
```

## 2. AWS 전체 구성도

```mermaid
flowchart TB
  USER["Internet Client"]
  MCPCLIENT["MCP Client"]

  subgraph AWS["AWS Account 063455554839 / ap-northeast-2"]
    subgraph EDGE["Public Edge"]
      IGW["Internet Gateway"]
      APPALB["App Public ALB\nhashicorp-lab-dev-alb"]
      KCALB["Keycloak Public ALB\nhashicorp-lab-dev-keycloak-alb"]
      APIGW["API Gateway HTTP API\nhashicorp-lab-dev-mcp-api"]
      NAT["NAT Gateways\n2 AZ"]
    end

    subgraph VPC["VPC vpc-0faaeb5858901d385 / 10.40.0.0/16"]
      subgraph APP["Private App Subnets"]
        APPA["App EC2\n10.40.10.73"]
        APPC["App EC2\n10.40.11.47"]
        KCA["Keycloak EC2\n10.40.10.114"]
        KCC["Keycloak EC2\n10.40.11.53"]
        MCPA["MCP EC2\n10.40.10.29"]
        MCPC["MCP EC2\n10.40.11.40"]
        MCPALB["MCP Internal ALB"]
        BENCH["Vault Benchmark Runner\n10.40.10.98"]
      end

      subgraph VAULT["Vault Enterprise Private Cluster"]
        VAULT1["Vault Leader\n10.40.10.202"]
        VAULT2["Vault Standby\n10.40.11.68"]
        VAULT3["Vault Standby\n10.40.10.147"]
      end

      subgraph DATA["Private DB Subnets"]
        APPRDS["App PostgreSQL\nMulti-AZ"]
        KCRDS["Keycloak PostgreSQL\nMulti-AZ"]
      end
    end

    subgraph CTRL["AWS Managed Services"]
      KMS["KMS Auto-unseal Key"]
      SSM["SSM SecureString"]
      SECRETS["Secrets Manager"]
    end
  end

  USER -->|"HTTP 80"| APPALB
  USER -->|"HTTP 80"| KCALB
  MCPCLIENT -->|"HTTPS"| APIGW
  IGW --> APPALB
  IGW --> KCALB

  APPALB -->|"HTTP 8080"| APPA
  APPALB -->|"HTTP 8080"| APPC
  KCALB -->|"HTTP 8080"| KCA
  KCALB -->|"HTTP 8080"| KCC
  APIGW -->|"VPC Link"| MCPALB
  MCPALB -->|"HTTP 8081"| MCPA
  MCPALB -->|"HTTP 8081"| MCPC

  APPA -->|"PostgreSQL 5432"| APPRDS
  APPC -->|"PostgreSQL 5432"| APPRDS
  KCA -->|"PostgreSQL 5432"| KCRDS
  KCC -->|"PostgreSQL 5432"| KCRDS
  APPA -->|"Vault API 8200"| VAULT1
  APPC -->|"Vault API 8200"| VAULT1
  BENCH -->|"Benchmark Traffic 8200"| VAULT1
  VAULT1 <-->|"Raft 8201"| VAULT2
  VAULT1 <-->|"Raft 8201"| VAULT3
  VAULT1 -->|"Auto-unseal"| KMS
  VAULT1 -->|"Init and license"| SSM
  KCA -->|"Admin and DB secrets"| SECRETS
  KCC -->|"Admin and DB secrets"| SECRETS
  APPA -->|"Outbound HTTPS"| NAT
  APPC -->|"Outbound HTTPS"| NAT
  KCA -->|"Outbound HTTPS"| NAT
  KCC -->|"Outbound HTTPS"| NAT
  MCPA -->|"Outbound HTTPS"| NAT
  MCPC -->|"Outbound HTTPS"| NAT
  BENCH -->|"Outbound HTTPS"| NAT
  NAT --> IGW
```

## 3. Vault Enterprise 상세 구성

```mermaid
flowchart TB
  APP["App EC2 / Future Workloads"]
  BENCH["Vault Benchmark Runner\nc7g.2xlarge / 10.40.10.98"]
  VAULTSG["Vault SG: sg-008ac46b7cedb8ffe"]

  subgraph CLUSTER["Vault Enterprise Raft Cluster"]
    V1["Vault 01 Leader\n10.40.10.202"]
    Q["Raft Quorum\nTCP 8201"]
    V2["Vault 02 Performance Standby\n10.40.11.68"]
    V3["Vault 03 Performance Standby\n10.40.10.147"]
  end

  KMS["AWS KMS\nalias/hashicorp-lab-dev-vault-unseal"]
  SSM["SSM SecureString\n/license and /init"]
  RESULT["Benchmark Results\n/opt/vault-benchmark/results"]

  APP -->|"TCP 8200"| VAULTSG
  BENCH -->|"Transit and FPE load\nTCP 8200"| VAULTSG
  VAULTSG --> V1
  VAULTSG --> V2
  VAULTSG --> V3

  V1 <-->|"Raft"| Q
  V2 <-->|"Raft"| Q
  V3 <-->|"Raft"| Q

  Q -->|"Auto-unseal"| KMS
  Q -->|"Bootstrap data"| SSM
  BENCH -->|"Read init token at runtime"| SSM
  BENCH --> RESULT
```

## 4. 보안 그룹 관계

```mermaid
flowchart TB
  subgraph WEB["Web Request Path"]
    INTERNET["0.0.0.0/0"]
    ALBSG["ALB SG\nTCP 80"]
    ALB["Application Load Balancer"]
    APPSG["App SG\nTCP 8080 from ALB"]
    APP["ASG EC2 Instances"]
    DBSG["DB SG\nTCP 5432 from App"]
    DB["RDS PostgreSQL"]
  end

  subgraph VAULTPATH["Vault Access Path"]
    VPC["VPC CIDR\n10.40.0.0/16"]
    VAULTSG["Vault SG\nTCP 8200 from VPC"]
    VAULTAPI["Vault API"]
    RAFTSG["Vault SG self rule\nTCP 8201"]
    RAFT["Vault Raft Traffic"]
  end

  INTERNET --> ALBSG --> ALB --> APPSG --> APP --> DBSG --> DB
  VPC --> VAULTSG --> VAULTAPI
  VAULTSG --> RAFTSG --> RAFT
```

## 5. Keycloak 및 MCP/API Gateway 흐름

```mermaid
flowchart TB
  ADMIN["Admin Browser"]
  CLIENT["MCP Client"]

  subgraph KEYCLOAK["Keycloak Identity Plane"]
    KCALB["Public Keycloak ALB\nHTTP 80"]
    KCTG["Target Group\n/realms/master"]
    KCN1["Keycloak Node 1\ni-0f0d3272dcc541c1d"]
    KCN2["Keycloak Node 2\ni-097f55a48266aaf13"]
    KCDB["Keycloak PostgreSQL\nMulti-AZ"]
    KCSECRET["Secrets Manager\nAdmin and DB credentials"]
  end

  subgraph MCP["MCP Integration Plane"]
    APIGW["API Gateway HTTP API\nHTTPS endpoint"]
    VPCLINK["API Gateway VPC Link"]
    MCPALB["Internal MCP ALB"]
    MCPTG["Target Group\n/health"]
    MCPN1["MCP Node 1\ni-0e6c50c07e78ed4d9"]
    MCPN2["MCP Node 2\ni-07452c46ba4f594bd"]
  end

  ADMIN -->|"HTTP 80"| KCALB
  KCALB --> KCTG
  KCTG -->|"HTTP 8080"| KCN1
  KCTG -->|"HTTP 8080"| KCN2
  KCN1 <-->|"JGroups 7800 / 57800"| KCN2
  KCN1 -->|"PostgreSQL 5432"| KCDB
  KCN2 -->|"PostgreSQL 5432"| KCDB
  KCN1 --> KCSECRET
  KCN2 --> KCSECRET

  CLIENT -->|"HTTPS /mcp"| APIGW
  APIGW --> VPCLINK
  VPCLINK --> MCPALB
  MCPALB --> MCPTG
  MCPTG -->|"HTTP 8081"| MCPN1
  MCPTG -->|"HTTP 8081"| MCPN2
```

## 6. 요청 및 Vault 처리 흐름

```mermaid
sequenceDiagram
  participant User as Internet Client
  participant ALB as Public ALB
  participant ASG as Auto Scaling Group
  participant EC2 as EC2 Nginx App
  participant Vault as Vault Enterprise Leader
  participant Standby as Vault Performance Standby
  participant KMS as AWS KMS Auto-Unseal
  participant RDS as RDS PostgreSQL
  participant NAT as NAT Gateway
  participant Internet as Internet

  User->>ALB: HTTP 80
  ALB->>ASG: Target selection
  ASG->>EC2: HTTP 8080
  EC2-->>ALB: HTML response
  ALB-->>User: HTTP 200
  EC2->>RDS: PostgreSQL 5432
  EC2->>Vault: Secrets API 8200
  Vault->>Standby: Raft replication 8201
  Vault->>KMS: Auto-unseal key operation
  EC2->>NAT: OS package update egress
  NAT->>Internet: Outbound HTTPS
```

## 7. 운영 메모

- Vault Enterprise는 3노드 Raft 클러스터로 초기화됨.
- Vault 리더는 `10.40.10.202`, standby는 `10.40.11.68`, `10.40.10.147`.
- Vault init 결과는 `/hashicorp-lab/dev/vault/init` SSM SecureString에 저장됨.
- `/Users/heobyeong-ug/Downloads/vault.hclic`는 `2026-05-31` 만료라 기동 실패했고, 현재 SSM 라이선스 파라미터는 `vault_exp20260930.hclic` 내용으로 갱신됨.
- Keycloak은 2노드 EC2 ASG와 전용 PostgreSQL Multi-AZ RDS로 구성됨.
- MCP 서버는 2노드 EC2 ASG, 내부 ALB, API Gateway HTTP API VPC Link로 구성됨.
- Vault benchmark runner는 private subnet의 `c7g.2xlarge` 단일 EC2로 구성됨.
- ALB HTTP 응답 정상 확인됨.
- Keycloak `/realms/master`, MCP `/health`, MCP JSON-RPC `initialize` 응답 정상 확인됨.
- Vault Transit smoke benchmark와 Transform FPE smoke benchmark 정상 확인됨.
- RDS는 `available`, Multi-AZ 활성화 상태.
- 실습이 끝나면 `envs/dev`에서 `terraform destroy`로 비용 발생 리소스를 내려야 함.
