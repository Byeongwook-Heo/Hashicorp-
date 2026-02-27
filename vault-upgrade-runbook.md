# Vault 업그레이드 런북 (Linux + Kubernetes)

최종 업데이트: 2026-02-27

## 1. 목적과 범위

이 문서는 HashiCorp Vault를 운영 환경에서 안전하게 업그레이드하기 위한 실무 런북이다.

- 대상 1: Linux(systemd) 기반 Self-managed Vault
- 대상 2: Kubernetes + Helm 기반 Vault
- 포함 범위:
  - 사전 점검
  - 업그레이드 절차
  - 리스크 및 예방책
  - 트러블슈팅
  - 업그레이드 후 검증 체크리스트

## 2. 핵심 원칙

1. 반드시 백업(raft snapshot + 설정 파일)을 먼저 수행한다.
2. HA 환경에서는 Standby 노드부터 순차 업그레이드하고 Active는 마지막에 처리한다.
3. 한 번에 한 노드/Pod만 변경한다.
4. 롤백은 바이너리만 되돌리는 개념이 아니며, 필요 시 데이터 스냅샷 복원까지 고려한다.

## 3. 사전 준비 (공통)

### 3.1 버전 및 상태 확인

```bash
vault version
vault status
vault operator raft list-peers
```

확인 포인트:

- 현재 Vault 버전
- Active/Standby 상태
- Raft peer 상태(Healthy 여부)

### 3.2 스냅샷 백업

Integrated Storage(Raft) 사용 시:

```bash
export TS=$(date +%Y%m%d_%H%M%S)
vault operator raft snapshot save /tmp/vault_raft_${TS}.snap
ls -lh /tmp/vault_raft_${TS}.snap
```

백업 권장사항:

- 스냅샷 파일을 로컬뿐 아니라 원격 저장소에도 보관
- 복구 테스트 가능한 검증 환경 확보

### 3.3 설정/시크릿 의존성 점검

- Vault 설정 파일(`vault.hcl`, Helm values) 백업
- Auto-unseal 사용 시 KMS/HSM 권한 확인
- TLS 인증서 만료/경로/권한 확인
- 주요 인증 경로(`auth/*`)와 엔진(`secret/*`) 헬스체크 시나리오 준비

### 3.4 변경 창 및 통제

- 점검 시간 확보(트래픽 저점 시간 권장)
- 롤백 기준 정의:
  - 예: 리더 선출 실패가 N분 이상 지속
  - 예: 로그인/읽기/쓰기 헬스체크 실패 지속

## 4. Linux(systemd) 업그레이드 절차

### 4.1 단일 노드 (다운타임 허용)

1. 서비스 정지

```bash
sudo systemctl stop vault
sudo systemctl status vault --no-pager
```

2. 패키지 또는 바이너리 업그레이드

```bash
# 예시: 바이너리 교체
sudo install -m 0755 vault /usr/local/bin/vault
vault version
```

3. `mlock` 권한 재적용 확인(`setcap`)

```bash
sudo setcap cap_ipc_lock=+ep /usr/local/bin/vault
getcap /usr/local/bin/vault
```

4. 서비스 기동 및 로그 확인

```bash
sudo systemctl daemon-reload
sudo systemctl start vault
sudo systemctl status vault --no-pager
sudo journalctl -u vault -n 200 --no-pager
```

5. 상태 검증

```bash
vault status
```

### 4.2 HA 클러스터 (권장 순서)

1. Standby 노드 1대 선택
2. 해당 노드에서 `stop -> upgrade -> setcap 확인 -> start`
3. 클러스터 정상 합류 확인
4. 다음 Standby 반복
5. Active 노드는 마지막에 처리

검증 명령어:

```bash
vault status
vault operator raft list-peers
```

주의:

- 업그레이드 중 여러 노드를 동시에 내리지 않는다.
- Active를 먼저 내리지 않는다.

## 5. Kubernetes(Helm) 업그레이드 절차

변수 예시:

```bash
NS=vault
RELEASE=vault
CHART_VERSION=<target_chart_version>
VAULT_VERSION=<target_vault_version>
```

### 5.1 현재 릴리스 백업

```bash
helm -n $NS ls
helm -n $NS get values $RELEASE -o yaml > vault_values_before.yaml
helm -n $NS get manifest $RELEASE > vault_manifest_before.yaml
```

### 5.2 리더 확인 및 스냅샷 백업

```bash
kubectl -n $NS get pods
kubectl -n $NS exec -it <leader-pod> -- vault status
kubectl -n $NS exec -it <leader-pod> -- sh -c 'vault operator raft snapshot save /tmp/pre_upgrade.snap'
kubectl -n $NS cp <leader-pod>:/tmp/pre_upgrade.snap ./pre_upgrade.snap
```

### 5.3 StatefulSet 업데이트 전략 확인

```bash
kubectl -n $NS get sts $RELEASE -o jsonpath='{.spec.updateStrategy.type}{"\n"}'
```

권장: `OnDelete`

- 이유: Pod 재시작 순서를 운영자가 강제할 수 있다.

### 5.4 Helm 업그레이드

```bash
helm repo update
helm -n $NS upgrade $RELEASE hashicorp/vault \
  --version $CHART_VERSION \
  -f vault_values_before.yaml \
  --set server.image.tag=$VAULT_VERSION
```

### 5.5 Pod 순차 교체 (Standby 먼저, Active 마지막)

예시:

```bash
kubectl -n $NS delete pod vault-2
kubectl -n $NS get pods -w
kubectl -n $NS delete pod vault-1
kubectl -n $NS get pods -w
# Active 마지막
kubectl -n $NS delete pod vault-0
kubectl -n $NS get pods -w
```

각 단계 검증:

```bash
kubectl -n $NS exec -it vault-0 -- vault operator raft list-peers
kubectl -n $NS logs vault-0 --tail=200
```

## 6. 리스크와 예방책

| 리스크 | 원인 | 영향 | 예방 |
|---|---|---|---|
| 백업 누락 | snapshot 미수행 | 장애 시 복구 불가/지연 | 업그레이드 직전 snapshot, 별도 저장소 보관 |
| Active 선행 재시작 | 잘못된 순서 | 리더 선출 지연, 서비스 불안정 | Standby 선행, Active 마지막 |
| `setcap` 누락 | 수동 바이너리 교체 | 기동 실패(`Failed to lock memory`) | 교체 후 `getcap` 확인 절차 고정 |
| Helm 값 누락 | `--set`/values 드리프트 | 인증/스토리지 오동작 | `helm get values` 백업 후 동일 값 기반 배포 |
| 버전 비호환 | Breaking change 미확인 | 기능 장애/기동 실패 | 릴리스 노트 검토, 사전 테스트 |
| 성급한 롤백 | 데이터 상태 고려 부족 | 추가 장애 발생 | 롤백 시 데이터 스냅샷 복원 플랜 포함 |

## 7. 트러블슈팅

### 7.1 Linux에서 서비스 기동 실패

증상:

- `systemctl start vault` 실패

확인:

```bash
sudo systemctl status vault --no-pager
sudo journalctl -u vault -n 200 --no-pager
```

조치:

- 설정 파일 경로/문법 확인
- TLS 파일 권한 확인
- `setcap` 재적용 확인

### 7.2 `Failed to lock memory` 오류

확인:

```bash
getcap /usr/local/bin/vault
```

조치:

```bash
sudo setcap cap_ipc_lock=+ep /usr/local/bin/vault
sudo systemctl restart vault
```

### 7.3 Kubernetes에서 CrashLoopBackOff

확인:

```bash
kubectl -n $NS describe pod <pod-name>
kubectl -n $NS logs <pod-name> --previous
```

조치:

- values 변경점 비교(`helm get values`)
- 시크릿/환경변수/스토리지 클래스 확인
- Vault config template 렌더링 오류 확인

### 7.4 Raft peer 이상

확인:

```bash
vault operator raft list-peers
```

조치:

- 네트워크/TLS 이름해결 문제 확인
- 잘못 남은 peer 제거 검토
- 재조인 시 데이터 디렉터리 상태 점검 후 진행

### 7.5 롤백 판단 시

원칙:

- 바이너리만 다운그레이드하지 말고 데이터 상태까지 함께 검토

실행 예시:

1. 서비스 중지/Pod 격리
2. 안정 버전으로 이미지 또는 바이너리 복원
3. 필요 시 snapshot restore 절차 수행
4. 헬스체크 시나리오 통과 후 트래픽 복귀

## 8. 업그레이드 후 검증 체크리스트

- [ ] `vault version`이 목표 버전이다.
- [ ] 모든 노드/Pod가 정상 기동 상태다.
- [ ] `vault status`에서 Sealed=false이고 Active/Standby가 정상이다.
- [ ] `vault operator raft list-peers` 결과가 기대와 일치한다.
- [ ] 인증(로그인), secret read/write, 정책 평가가 정상 동작한다.
- [ ] 모니터링/로그에서 오류율 급증이 없다.

## 9. 참고 링크

- Vault Upgrade: <https://developer.hashicorp.com/vault/docs/upgrade>
- Vault HA Upgrade: <https://developer.hashicorp.com/vault/docs/upgrade/vault-ha-upgrade>
- Vault Rollback: <https://developer.hashicorp.com/vault/docs/upgrade/rollback>
- Vault on Kubernetes Helm: <https://developer.hashicorp.com/vault/docs/deploy/kubernetes/helm/run>
- Vault Install: <https://developer.hashicorp.com/vault/install>
