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
flowchart LR
  USER["Internet Client"]

  subgraph AWS["AWS Account 063455554839 / Region ap-northeast-2"]
    subgraph VPC["VPC: vpc-0faaeb5858901d385 / 10.40.0.0/16"]
      subgraph PUBLIC["Public Subnets"]
        IGW["Internet Gateway"]
        ALB["ALB: hashicorp-lab-dev-alb"]
        TG["Target Group: HTTP 8080"]
        NAT["NAT Gateways"]
      end

      subgraph APP["Private App Subnets"]
        APPA["App EC2: ap-northeast-2a / 10.40.10.73"]
        APPC["App EC2: ap-northeast-2c / 10.40.11.47"]
      end

      subgraph VAULT["Vault Enterprise Private Subnets"]
        VAULTAPI["Vault API Endpoint: 8200"]
        VAULTRAFT["Vault Raft Cluster: 3 nodes / 8201"]
      end

      subgraph DATA["Private DB Subnets"]
        RDS["RDS PostgreSQL Multi-AZ"]
      end

      subgraph AWSCTRL["AWS Control Plane"]
        KMS["KMS Auto-unseal Key"]
        SSM["SSM SecureString"]
      end
    end
  end

  USER -->|"HTTP 80"| ALB
  IGW --> ALB
  ALB --> TG
  TG -->|"HTTP 8080"| APPA
  TG -->|"HTTP 8080"| APPC
  APPA -->|"PostgreSQL 5432"| RDS
  APPC -->|"PostgreSQL 5432"| RDS
  APPA -->|"Vault API 8200"| VAULTAPI
  APPC -->|"Vault API 8200"| VAULTAPI
  VAULTAPI --> VAULTRAFT
  VAULTRAFT -->|"Auto-unseal"| KMS
  VAULTRAFT -->|"License and init output"| SSM
  APPA -->|"Outbound HTTPS"| NAT
  APPC -->|"Outbound HTTPS"| NAT
  VAULTRAFT -->|"Outbound HTTPS"| NAT
  NAT --> IGW
```

## 3. Vault Enterprise 상세 구성

```mermaid
flowchart TB
  APP["App EC2 / Future Workloads"]
  VAULTSG["Vault SG: sg-008ac46b7cedb8ffe"]

  subgraph CLUSTER["Vault Enterprise Raft Cluster"]
    V1["Vault 01 Leader\n10.40.10.202"]
    Q["Raft Quorum\nTCP 8201"]
    V2["Vault 02 Performance Standby\n10.40.11.68"]
    V3["Vault 03 Performance Standby\n10.40.10.147"]
  end

  KMS["AWS KMS\nalias/hashicorp-lab-dev-vault-unseal"]
  SSM["SSM SecureString\n/license and /init"]

  APP -->|"TCP 8200"| VAULTSG
  VAULTSG --> V1
  VAULTSG --> V2
  VAULTSG --> V3

  V1 <-->|"Raft"| Q
  V2 <-->|"Raft"| Q
  V3 <-->|"Raft"| Q

  Q -->|"Auto-unseal"| KMS
  Q -->|"Bootstrap data"| SSM
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

## 5. 요청 및 Vault 처리 흐름

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

## 6. 운영 메모

- Vault Enterprise는 3노드 Raft 클러스터로 초기화됨.
- Vault 리더는 `10.40.10.202`, standby는 `10.40.11.68`, `10.40.10.147`.
- Vault init 결과는 `/hashicorp-lab/dev/vault/init` SSM SecureString에 저장됨.
- `/Users/heobyeong-ug/Downloads/vault.hclic`는 `2026-05-31` 만료라 기동 실패했고, 현재 SSM 라이선스 파라미터는 `vault_exp20260930.hclic` 내용으로 갱신됨.
- ALB HTTP 응답 정상 확인됨.
- RDS는 `available`, Multi-AZ 활성화 상태.
- 실습이 끝나면 `envs/dev`에서 `terraform destroy`로 비용 발생 리소스를 내려야 함.
