# Terraform 초기 세팅 가이드

이 문서는 **개발/테스트 환경 기준**으로 Terraform을 처음 설치하고, 기본 프로젝트를 초기화한 뒤 실행/검증하는 최소 절차를 정리한 가이드입니다.

> 운영(Production) 환경에서는 원격 상태 저장소(S3/GCS/Azure Blob 등), 상태 잠금(DynamoDB 등), 워크스페이스/환경 분리, 시크릿 관리(Vault/CI Secret Manager)를 반드시 함께 적용하세요.

---

## 1) Terraform 설치

### macOS (Homebrew)

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
terraform -version
```

### Ubuntu/Debian (APT)

```bash
sudo apt-get update && sudo apt-get install -y gpg lsb-release
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install -y terraform
terraform -version
```

---

## 2) 프로젝트 디렉터리 및 기본 파일 구성

```bash
mkdir terraform-basic && cd terraform-basic
touch main.tf variables.tf outputs.tf providers.tf terraform.tfvars .gitignore
```

권장 `.gitignore`:

```gitignore
.terraform/
*.tfstate
*.tfstate.*
crash.log
crash.*.log
*.tfvars
!.terraform.lock.hcl
override.tf
override.tf.json
*_override.tf
*_override.tf.json
```

---

## 3) 최소 예제 코드 작성

`providers.tf`:

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

provider "local" {}
```

`variables.tf`:

```hcl
variable "message" {
  description = "생성할 파일에 기록할 메시지"
  type        = string
}
```

`main.tf`:

```hcl
resource "local_file" "hello" {
  filename = "hello.txt"
  content  = var.message
}
```

`outputs.tf`:

```hcl
output "file_path" {
  description = "생성된 파일 경로"
  value       = local_file.hello.filename
}
```

`terraform.tfvars`:

```hcl
message = "Hello from Terraform"
```

---

## 4) 초기화 및 계획 확인

```bash
terraform init
terraform fmt -recursive
terraform validate
terraform plan -out=tfplan
```

- `init`: 프로바이더 다운로드 및 작업 디렉터리 초기화
- `fmt`: 코드 포맷 정리
- `validate`: 문법/구성 유효성 검사
- `plan`: 실제 반영 전 변경 예정 사항 확인

---

## 5) 리소스 반영 및 검증

```bash
terraform apply tfplan
terraform output
cat hello.txt
```

정상 동작 시 `hello.txt` 파일이 생성되고, `terraform output`에서 `file_path`를 확인할 수 있습니다.

---

## 6) 정리(삭제)

```bash
terraform destroy
```

학습/테스트가 끝나면 생성한 리소스를 정리해 불필요한 비용 또는 잔여 리소스를 방지하세요.

---

## 7) 운영 환경 전환 체크리스트

- 원격 백엔드 사용(`backend "s3"` 등)
- 상태 잠금 구성(DynamoDB 등)
- 환경 분리(dev/stage/prod) + 워크스페이스/디렉터리 전략
- CI/CD에서 `terraform fmt -check`, `validate`, `plan` 자동화
- 시크릿 코드 하드코딩 금지(환경변수/Vault/Secret Manager)
- 정책 기반 가드레일(Sentinel/OPA/Conftest 등) 적용

필요하면 다음 단계로 AWS/GCP/Azure 실전 예제(VPC, IAM, Kubernetes) 가이드까지 확장할 수 있습니다.
