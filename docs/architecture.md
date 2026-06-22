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

  subgraph AWS["AWS Account 063455554839 / Region ap-northeast-2"]
    subgraph VPC["VPC: vpc-0faaeb5858901d385 / 10.40.0.0/16"]
      IGW["Internet Gateway: igw-00ab287079b961349"]
      ALB["ALB: hashicorp-lab-dev-alb"]
      TG["Target Group: hashicorp-lab-dev-app-tg / HTTP 8080"]

      subgraph AZA["AZ: ap-northeast-2a"]
        PUBA["Public Subnet: subnet-068dffa0960dbcffd / 10.40.0.0/24"]
        NATA["NAT Gateway: nat-055071e22c99f9c63 / 43.201.225.26"]
        APPA["App Private Subnet: subnet-026ffcc7ad4b697c6 / 10.40.10.0/24"]
        EC2A["EC2: i-08450f25c585819e4 / t4g.2xlarge / 10.40.10.73"]
        VAULT1["Vault Enterprise: i-0711d6a1adb0e1609 / leader / 10.40.10.202"]
        VAULT3["Vault Enterprise: i-013740958d1b26329 / standby / 10.40.10.147"]
        DBA["DB Private Subnet: subnet-07e488fded4534ef2 / 10.40.20.0/24"]
      end

      subgraph AZC["AZ: ap-northeast-2c"]
        PUBC["Public Subnet: subnet-068a968f3426594db / 10.40.1.0/24"]
        NATC["NAT Gateway: nat-043cd9721598266d0 / 15.164.15.171"]
        APPC["App Private Subnet: subnet-06c50448784244f83 / 10.40.11.0/24"]
        EC2C["EC2: i-00ff48dc6e30fa13e / t4g.2xlarge / 10.40.11.47"]
        VAULT2["Vault Enterprise: i-01d934cd430ab6576 / standby / 10.40.11.68"]
        DBC["DB Private Subnet: subnet-0cd8afeeca0ace850 / 10.40.21.0/24"]
      end

      RDS["RDS PostgreSQL: hashicorp-lab-dev-postgres / db.t4g.2xlarge / Multi-AZ"]
      KMS["AWS KMS: alias/hashicorp-lab-dev-vault-unseal"]
      SSM["SSM SecureString: Vault license and init output"]
    end
  end

  USER -->|"HTTP 80"| ALB
  ALB --> TG
  TG -->|"HTTP 8080"| EC2A
  TG -->|"HTTP 8080"| EC2C
  EC2A -->|"PostgreSQL 5432"| RDS
  EC2C -->|"PostgreSQL 5432"| RDS
  EC2A -->|"Vault API 8200"| VAULT1
  EC2C -->|"Vault API 8200"| VAULT1
  VAULT1 <-->|"Raft 8201"| VAULT2
  VAULT1 <-->|"Raft 8201"| VAULT3
  VAULT2 <-->|"Raft 8201"| VAULT3
  VAULT1 -->|"Auto-unseal"| KMS
  VAULT2 -->|"Auto-unseal"| KMS
  VAULT3 -->|"Auto-unseal"| KMS
  VAULT1 -->|"License and init bootstrap"| SSM
  VAULT2 -->|"License bootstrap"| SSM
  VAULT3 -->|"License bootstrap"| SSM
  EC2A -->|"Outbound update/install"| NATA
  EC2C -->|"Outbound update/install"| NATC
  NATA --> IGW
  NATC --> IGW
  IGW --> USER
  RDS --- DBA
  RDS --- DBC
```

## 3. 보안 그룹 관계

```mermaid
flowchart LR
  INTERNET["0.0.0.0/0"]
  ALBSG["ALB SG: sg-0426535b0c315d7ec"]
  APPSG["App SG: sg-03595a6d14b909f7f"]
  DBSG["DB SG: sg-0fc8953d806482eb4"]
  VAULTSG["Vault SG: sg-008ac46b7cedb8ffe"]
  VPC["VPC CIDR: 10.40.0.0/16"]
  ALB["Application Load Balancer"]
  APP["ASG EC2 Instances"]
  DB["RDS PostgreSQL"]
  VAULT["Vault Enterprise Raft Cluster"]

  INTERNET -->|"Allow TCP 80"| ALBSG
  ALBSG --> ALB
  ALB -->|"Forward TCP 8080"| APPSG
  APPSG --> APP
  APP -->|"Allow TCP 5432"| DBSG
  DBSG --> DB
  VPC -->|"Allow TCP 8200"| VAULTSG
  VAULTSG --> VAULT
  VAULTSG -->|"Self allow TCP 8201"| VAULTSG
```

## 4. 요청 및 Vault 처리 흐름

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

## 5. 운영 메모

- Vault Enterprise는 3노드 Raft 클러스터로 초기화됨.
- Vault 리더는 `10.40.10.202`, standby는 `10.40.11.68`, `10.40.10.147`.
- Vault init 결과는 `/hashicorp-lab/dev/vault/init` SSM SecureString에 저장됨.
- `/Users/heobyeong-ug/Downloads/vault.hclic`는 `2026-05-31` 만료라 기동 실패했고, 현재 SSM 라이선스 파라미터는 `vault_exp20260930.hclic` 내용으로 갱신됨.
- ALB HTTP 응답 정상 확인됨.
- RDS는 `available`, Multi-AZ 활성화 상태.
- 실습이 끝나면 `envs/dev`에서 `terraform destroy`로 비용 발생 리소스를 내려야 함.
