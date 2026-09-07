# HashiCorp Enterprise AWS Lab

[한국어](README.md) · [English](README.en.md)

## 목적

Terraform으로 AWS 네트워크, 애플리케이션, Vault Enterprise와 인증·데이터 계층을 구성하고 운영 절차를 연습하는 인프라 실습 프로젝트입니다.

## 기대 효과

- 코드와 실행 계획으로 인프라의 구성·의존성을 확인합니다.
- Vault Raft 클러스터, 머신 인증, 데이터 계층과의 연계를 함께 학습합니다.
- 환경별 변수와 상태를 구분해 반복 가능한 실습 기준을 마련합니다.

## 주요 기능과 구성

- `envs/dev/`: 통합 실습 환경의 Terraform 진입점
- `modules/`: VPC, ALB, EC2, Vault, Keycloak, MCP, RDS 등 구성 모듈
- `aws-ec2-hcp/`, `aws-ec2-hcp-hashicorp_lab/`: HCP Terraform 기반 EC2 실습
- `aws-ec2-tfe/`: Terraform Enterprise 기반 EC2 실습
- `scripts/`, `docs/`: 운영, 성능 측정, 아키텍처 안내

## 시작하기

Terraform 버전은 `.terraform-version`을 확인하세요. AWS 인증, HCP Terraform 또는 Terraform Enterprise 접근 권한, 사용 가능한 AMI·네트워크·키 페어와 Vault Enterprise 라이선스가 필요합니다.

1. 사용할 예제 디렉터리와 `variables.tf`를 확인합니다.
2. 실제 환경의 입력값과 원격 상태 설정을 준비합니다.
3. 다음과 같이 초기화·검증·계획을 실행하고 변경 대상과 비용을 검토합니다.

```bash
terraform -chdir=envs/dev init
terraform -chdir=envs/dev validate
terraform -chdir=envs/dev plan
```

예제 주소와 리소스 ID는 실제 접속값이 아닙니다. 인증정보와 state/plan 파일은 Git에 저장하지 마세요.

## 문서

- [아키텍처](docs/architecture.md)
- [운영](docs/operations.md)
- [Vault 벤치마크](docs/vault-benchmark.md)
- [Terraform 설정](TERRAFORM_SETUP.md)

## 범위와 제약사항

학습용 구성입니다. EC2, RDS, NAT Gateway, 로드밸런서, 디스크와 로그 등에서 비용이 발생합니다. 큰 인스턴스 기본값을 그대로 적용하지 말고 용량을 검토하세요. 라이선스·TLS·백업·네트워크 정책은 배포 환경에 맞게 구성해야 하며, 운영 환경의 가용성이나 성능을 보증하지 않습니다.
