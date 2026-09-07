# AWS EC2 · HCP Terraform

[한국어](README.md) · [English](README.en.md)

## 목적

기존 네트워크와 보안그룹을 사용해 EC2를 구성하고 원격 Terraform 실행을 연습하는 예제입니다.

## 기대 효과

- 원격 워크스페이스의 입력값·계획·상태 관리 흐름을 이해합니다.

## 주요 기능과 구성

- EC2 인스턴스, 기존 서브넷·보안그룹·키 페어 입력
- ARM64 AMI와 호환되는 인스턴스 유형 필요

## 시작하기

이 디렉터리에서 `variables.tf`와 backend/cloud 설정을 확인하고 접근 가능한 환경 값을 지정하세요.

```bash
terraform init
terraform validate
terraform plan
```

## 범위와 제약사항

AMI ID는 리전과 계정 권한에 따라 다릅니다. 실제 SSH CIDR을 최소 범위로 지정하고, AWS 인증은 워크스페이스의 동적 자격증명 또는 승인된 secret 공급 경로를 사용하세요. 적용 시 EC2·스토리지 비용이 발생합니다.
