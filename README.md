# HashiCorp 실습 자료

Vault 운영·설정 및 Terraform 학습 문서를 모아 둔 저장소입니다.

## Vault Agentic AI Demo

AI Agent의 사용자 인증·OBO Token Exchange·MCP·Vault·DB 접근제어 데모는 **별도 저장소에서 관리합니다**.

- [Vault Agentic AI Demo — 한국어](https://github.com/Byeongwook-Heo/vault-agentic-ai-demo)
- [English README](https://github.com/Byeongwook-Heo/vault-agentic-ai-demo/blob/main/README.en.md)
- [설치 가이드](https://github.com/Byeongwook-Heo/vault-agentic-ai-demo/blob/main/docs/SETUP.ko.md)

새 저장소에는 시퀀스 다이어그램, 실제 챗봇 UI, 전체·제한·미승인 시나리오와 익명화된 배포 템플릿이 포함됩니다. 비공개 저장소는 접근 권한이 있는 계정으로 로그인해야 볼 수 있습니다.

## 독립 프로젝트

브랜치에 함께 있던 인프라와 애플리케이션은 다음 저장소에서 관리합니다.

| 프로젝트 | 기준 저장소 | 범위 |
|---|---|---|
| Enterprise AWS Lab | [hashicorp-enterprise-aws-lab](https://github.com/Byeongwook-Heo/hashicorp-enterprise-aws-lab) | Terraform 인프라, Vault·Keycloak·MCP·벤치마크·Bastion |
| Vault Security Portal | [vault-security-portal](https://github.com/Byeongwook-Heo/vault-security-portal) | 셀프서비스 포털, 승인·감사, Plugin Factory 확장 |

분리 저장소는 우선 비공개입니다. 기존 `enterprise-aws-lab`, `vault-portal-ui-refresh`, `factory-productivity-suite` 브랜치는 이력을 보존하며 후속 개발은 위 저장소의 `main`에서 진행합니다. 저장소 분리 과정에서는 AWS 배포를 실행하지 않았습니다.

## 기존 문서

- [Terraform 설정](TERRAFORM_SETUP.md)
- [Vault Guide](Vault%20Guide.md)
- [Vault 가이드](vault-guide.md)
- [Vault 업그레이드](vault-upgrade-runbook.md)
- [Vault 노트](vault.md)

실제 자격증명, 개인 경로, 운영 환경 식별값은 이 문서의 예제로 사용하지 않습니다.
