# HashiCorp Guides

[한국어](README.md) · [English](README.en.md)

Vault와 Terraform의 설치·학습·운영 절차를 정리한 기술 문서 저장소입니다. 실행 가능한 AWS 인프라 실습은 별도 `hashicorp-enterprise-aws-lab`에서 관리합니다.

## 문서

| 문서 | 용도 |
| --- | --- |
| [Vault Guide](vault-guide.md) | Vault 설치, 초기화, KV, 정책과 운영 시나리오의 기준 문서 |
| [Vault CLI / UI / HTTP API](vault-cli-ui-api.md) | Token, KV v2, UI, HTTP API 빠른 참조 |
| [Vault Upgrade Runbook](vault-upgrade-runbook.md) | Vault 업그레이드 준비·실행·검증 절차 |
| [Terraform Setup](TERRAFORM_SETUP.md) | Terraform 설치와 기본 프로젝트 초기화 |

## 저장소 역할

이 저장소는 **제품 가이드와 Runbook의 단일 원본**을 유지합니다. AWS 리소스, Terraform 모듈, Vault Enterprise 실습 인프라 자체는 [hashicorp-enterprise-aws-lab](https://github.com/Byeongwook-Heo/hashicorp-enterprise-aws-lab)에서 관리합니다.

## 시작하기

1. 목적에 맞는 문서를 선택합니다.
2. 제품 버전, OS, 권한, 네트워크와 라이선스 조건을 확인합니다.
3. 예제 주소·경로·입력값을 본인 환경에 맞게 변경합니다.
4. 운영 적용 전 테스트 환경에서 검증합니다.

## 범위와 제약사항

문서 중심 저장소이며 자동 설치나 현재 서비스 상태를 보증하지 않습니다. 제품 버전에 따라 명령과 절차가 달라질 수 있으므로 실제 적용 전 공식 문서와 대상 버전의 release note를 함께 확인하세요.
