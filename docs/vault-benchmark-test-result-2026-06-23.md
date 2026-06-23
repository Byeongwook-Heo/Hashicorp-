# Vault Benchmark Test Result

작성일: 2026-06-23

## 1. 한눈에 보는 결론

- 이번 테스트는 Vault Enterprise 3-node Raft 클러스터에서 Transit Encrypt, Transit Decrypt, Transform FPE Encode 성능을 확인한 결과다.
- 고객이 말한 `1000만 개 부하`는 요청 1건에 1000만 개를 넣는다는 뜻이 아니라, 테스트 전체에서 누적 `10,000,000`개 이상의 데이터를 처리하는 상황으로 정의했다.
- Transit은 대량 batch 처리 기준으로 초당 약 `42만~46만`개 데이터 항목 처리량이 관측됐다.
- Transform FPE Encode는 대량 batch 처리 기준으로 초당 약 `9만`개 데이터 항목 처리량이 관측됐다.
- 테스트 후 Vault는 unseal 상태와 active HA 상태를 유지했고, Raft peer도 `3 voters`로 정상 확인됐다.
- 이 결과는 5초 단위 matrix 테스트와 20초 chunk 기반 부하 테스트 결과다. 고객 제출용 최종 sizing 자료로 쓰려면 60초 이상 반복 테스트와 p95/p99 latency 수집을 추가하는 것이 좋다.

## 2. 용어 먼저 보기

| 용어 | 쉬운 의미 | 이 보고서에서 보는 방법 |
| --- | --- | --- |
| `requests/sec` | Vault API 요청을 초당 몇 건 처리했는지 | API 호출 처리량이다. TPS와 같은 의미로 보면 된다. |
| `Batch Count` | 요청 1건 안에 넣은 데이터 개수 | `Batch Count = 320`이면 API 요청 1번에 데이터 320개를 넣었다는 뜻이다. |
| `items/sec` | 실제 데이터 항목을 초당 몇 개 처리했는지 | `requests/sec x Batch Count`로 계산한다. 대량 데이터 처리 성능은 이 값을 보는 것이 더 중요하다. |
| `T/C` | Thread/Connection 동시성 | `T/C 32`는 32개 thread와 32개 connection으로 동시에 요청을 보낸 조건이다. |
| `Latency` | 요청 1건이 끝나기까지 걸린 시간 | 처리량이 높아도 latency가 너무 커지면 운영 기준에서는 위험할 수 있다. |
| `1000만 개 부하` | 전체 테스트에서 누적 처리할 데이터 목표량 | `Batch Count = 10,000,000`이 아니라 `Target Items = 10,000,000`으로 해석했다. |

계산 예시는 다음과 같다.

```text
requests/sec = 1,430.22
Batch Count  = 320
items/sec    = 1,430.22 x 320 = 457,670.40
```

즉, API 요청은 초당 약 1,430건이지만 요청마다 데이터 320개를 담았기 때문에 실제 데이터는 초당 약 45만 개 처리한 것이다.

## 3. 결과를 읽는 순서

1. API 호출 처리량을 보려면 `TPS` 표와 그래프를 본다.
2. 실제 데이터 처리량을 보려면 `Item Throughput` 표와 그래프를 본다.
3. 운영 관점에서는 `Item Throughput`, `Latency`, `CPU`를 함께 봐야 한다.
4. `1000만 개 부하 테스트`는 순간 TPS보다 누적 데이터 처리 가능 여부를 확인하는 용도다.

## 4. 테스트 목적

- 기존 PDF 자료와 유사하게 Vault Transit 일반 암호화/복호화 및 Vault Enterprise Transform FPE 성능을 측정한다.
- Batch 입력 개수 `20, 40, 80, 160, 320`과 Thread/Connection `2, 4, 8, 16, 32, 64, 128` 조합을 비교한다.
- 일시적으로 `10,000,000`개 데이터가 들어오는 상황을 batch 기반으로 재현한다.

## 5. 테스트 환경

| 항목 | 값 |
| --- | --- |
| Vault Version | `2.0.3+ent` |
| Vault Topology | 3-node integrated storage Raft cluster |
| Vault Leader | `i-0711d6a1adb0e1609` / `10.40.10.202` |
| Vault Followers | `i-01d934cd430ab6576` / `10.40.11.68`, `i-013740958d1b26329` / `10.40.10.147` |
| Benchmark Runner | `i-0892a214dc539c83f` / `10.40.10.98` / `c7g.2xlarge` |
| Target Endpoint | `http://10.40.10.202:8200` |
| Tools | `wrk`, `vault-benchmark`, Vault CLI |
| Matrix Duration | 5 seconds per case |
| 10M Load Definition | 10,000,000 data items, not 10,000,000 HTTP requests |

## 6. API 요청 처리량

아래 표는 Vault API가 초당 몇 건의 요청을 처리했는지 보여준다. 숫자가 높을수록 API 요청 처리량이 높다.

중요한 점은 `requests/sec`가 실제 데이터 개수와 같지 않다는 것이다. 예를 들어 `Batch Count = 320`이면 요청 1건이 데이터 320개를 포함한다.

### Transit Encrypt - TPS (Transit 암호화 API가 초당 처리한 HTTP 요청 수)

단위: requests/sec

![Transit Encrypt TPS](assets/vault-benchmark/transit-encrypt-tps.svg)

| Batch Count | T/C 2 | T/C 4 | T/C 8 | T/C 16 | T/C 32 | T/C 64 | T/C 128 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 1,891.45 | 3,715.34 | 7,274.78 | 9,428.19 | 9,751.89 | 10,028.89 | 10,286.19 |
| 40 | 1,563.71 | 3,084.81 | 5,544.26 | 6,587.38 | 6,724.62 | 6,721.05 | 6,695.83 |
| 80 | 1,246.01 | 2,447.42 | 3,690.09 | 4,280.33 | 4,239.48 | 4,200.06 | 4,156.26 |
| 160 | 891.53 | 1,732.65 | 2,259.79 | 2,478.49 | 2,498.79 | 2,521.83 | 2,555.81 |
| 320 | 591.78 | 1,158.49 | 1,349.92 | 1,425.59 | 1,445.99 | 1,402.45 | 1,430.22 |

해석: API 요청 건수 기준으로는 `Batch Count 20`, `T/C 128`에서 가장 높은 `10,286.19 requests/sec`가 나왔다. Batch Count가 커질수록 요청 1건의 payload가 커지므로 requests/sec는 낮아지는 경향이 있다.

### Transit Decrypt - TPS (Transit 복호화 API가 초당 처리한 HTTP 요청 수)

단위: requests/sec

![Transit Decrypt TPS](assets/vault-benchmark/transit-decrypt-tps.svg)

| Batch Count | T/C 2 | T/C 4 | T/C 8 | T/C 16 | T/C 32 | T/C 64 | T/C 128 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 1,818.68 | 3,686.94 | 7,237.46 | 9,267.90 | 9,501.28 | 9,856.47 | 9,932.21 |
| 40 | 1,553.17 | 3,090.12 | 5,385.56 | 6,457.15 | 6,485.43 | 6,371.78 | 6,437.56 |
| 80 | 1,165.83 | 2,388.91 | 3,534.67 | 4,047.91 | 4,039.55 | 4,030.91 | 3,989.04 |
| 160 | 850.50 | 1,670.58 | 2,172.50 | 2,355.97 | 2,389.77 | 2,380.52 | 2,357.05 |
| 320 | 558.18 | 1,074.46 | 1,265.58 | 1,331.45 | 1,322.46 | 1,333.53 | 1,280.17 |

해석: 복호화도 암호화와 비슷하게 `Batch Count 20`, `T/C 128`에서 가장 높은 `9,932.21 requests/sec`가 나왔다. requests/sec만 보면 작은 batch가 유리하지만, 실제 데이터 처리량은 아래 `Item Throughput`을 함께 봐야 한다.

### Transform FPE Encode - TPS (형태 보존 암호화 Encode API가 초당 처리한 HTTP 요청 수)

단위: requests/sec

![Transform FPE Encode TPS](assets/vault-benchmark/transform-fpe-encode-tps.svg)

| Batch Count | T/C 2 | T/C 4 | T/C 8 | T/C 16 | T/C 32 | T/C 64 | T/C 128 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 1,000.42 | 1,954.94 | 3,255.38 | 3,767.83 | 3,851.71 | 3,852.68 | 3,862.95 |
| 40 | 674.98 | 1,319.70 | 1,975.51 | 2,141.78 | 2,171.69 | 2,158.93 | 2,138.84 |
| 80 | 401.73 | 769.97 | 1,083.99 | 1,135.99 | 1,129.76 | 1,114.62 | 1,103.63 |
| 160 | 225.10 | 431.16 | 574.71 | 582.98 | 572.71 | 571.96 | 566.46 |
| 320 | 119.72 | 226.37 | 294.33 | 291.98 | 282.58 | 293.11 | 291.20 |

해석: Transform FPE는 Transit보다 연산 비용이 높기 때문에 TPS가 낮다. 이는 카드번호 형태를 유지하면서 암호화하는 작업이 일반 Transit 암호화보다 무겁기 때문이다.

## 7. 실제 데이터 처리량

아래 값은 `requests/sec x Batch Count`로 계산한 초당 데이터 항목 처리량이다. 대량 데이터 처리 관점에서는 이 섹션이 가장 중요하다.

### Transit Encrypt - Item Throughput (Transit 암호화 요청의 batch 안에 포함된 평문 데이터 항목을 초당 몇 개 처리했는지)

단위: items/sec

![Transit Encrypt Item Throughput](assets/vault-benchmark/transit-encrypt-item-throughput.svg)

| Batch Count | T/C 2 | T/C 4 | T/C 8 | T/C 16 | T/C 32 | T/C 64 | T/C 128 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 37,829.00 | 74,306.80 | 145,495.60 | 188,563.80 | 195,037.80 | 200,577.80 | 205,723.80 |
| 40 | 62,548.40 | 123,392.40 | 221,770.40 | 263,495.20 | 268,984.80 | 268,842.00 | 267,833.20 |
| 80 | 99,680.80 | 195,793.60 | 295,207.20 | 342,426.40 | 339,158.40 | 336,004.80 | 332,500.80 |
| 160 | 142,644.80 | 277,224.00 | 361,566.40 | 396,558.40 | 399,806.40 | 403,492.80 | 408,929.60 |
| 320 | 189,369.60 | 370,716.80 | 431,974.40 | 456,188.80 | 462,716.80 | 448,784.00 | 457,670.40 |

해석: 실제 암호화 데이터 처리량 기준으로는 `Batch Count 320`, `T/C 32`에서 가장 높은 `462,716.80 items/sec`가 나왔다.

### Transit Decrypt - Item Throughput (Transit 복호화 요청의 batch 안에 포함된 암호문 데이터 항목을 초당 몇 개 처리했는지)

단위: items/sec

![Transit Decrypt Item Throughput](assets/vault-benchmark/transit-decrypt-item-throughput.svg)

| Batch Count | T/C 2 | T/C 4 | T/C 8 | T/C 16 | T/C 32 | T/C 64 | T/C 128 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 36,373.60 | 73,738.80 | 144,749.20 | 185,358.00 | 190,025.60 | 197,129.40 | 198,644.20 |
| 40 | 62,126.80 | 123,604.80 | 215,422.40 | 258,286.00 | 259,417.20 | 254,871.20 | 257,502.40 |
| 80 | 93,266.40 | 191,112.80 | 282,773.60 | 323,832.80 | 323,164.00 | 322,472.80 | 319,123.20 |
| 160 | 136,080.00 | 267,292.80 | 347,600.00 | 376,955.20 | 382,363.20 | 380,883.20 | 377,128.00 |
| 320 | 178,617.60 | 343,827.20 | 404,985.60 | 426,064.00 | 423,187.20 | 426,729.60 | 409,654.40 |

해석: 실제 복호화 데이터 처리량 기준으로는 `Batch Count 320`, `T/C 64`에서 가장 높은 `426,729.60 items/sec`가 나왔다.

### Transform FPE Encode - Item Throughput (형태 보존 암호화 요청의 batch 안에 포함된 카드번호 항목을 초당 몇 개 처리했는지)

단위: items/sec

![Transform FPE Encode Item Throughput](assets/vault-benchmark/transform-fpe-encode-item-throughput.svg)

| Batch Count | T/C 2 | T/C 4 | T/C 8 | T/C 16 | T/C 32 | T/C 64 | T/C 128 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 20,008.40 | 39,098.80 | 65,107.60 | 75,356.60 | 77,034.20 | 77,053.60 | 77,259.00 |
| 40 | 26,999.20 | 52,788.00 | 79,020.40 | 85,671.20 | 86,867.60 | 86,357.20 | 85,553.60 |
| 80 | 32,138.40 | 61,597.60 | 86,719.20 | 90,879.20 | 90,380.80 | 89,169.60 | 88,290.40 |
| 160 | 36,016.00 | 68,985.60 | 91,953.60 | 93,276.80 | 91,633.60 | 91,513.60 | 90,633.60 |
| 320 | 38,310.40 | 72,438.40 | 94,185.60 | 93,433.60 | 90,425.60 | 93,795.20 | 93,184.00 |

해석: Transform FPE Encode는 `Batch Count 320`, `T/C 8`에서 가장 높은 `94,185.60 items/sec`가 나왔다. T/C를 더 올려도 처리량이 크게 늘지 않으므로 이 구간 이후에는 Vault 또는 연산 비용 쪽 병목에 가까워진 것으로 볼 수 있다.

## 8. 핵심 결과 요약

### 실제 데이터 처리량 기준

이 표는 실제로 데이터 항목을 초당 몇 개 처리했는지를 기준으로 정리한 것이다. 대량 암호화/복호화 요구사항을 볼 때는 이 표를 먼저 보면 된다.

| Scenario | Best Case | Best Item Throughput | 의미 |
| --- | --- | ---: | --- |
| Transit Encrypt | batch 320, T/C 32 | 462,716.80 items/sec | 평문 데이터를 초당 약 46만 개 암호화 |
| Transit Decrypt | batch 320, T/C 64 | 426,729.60 items/sec | 암호문 데이터를 초당 약 42만 개 복호화 |
| Transform FPE Encode | batch 320, T/C 8 | 94,185.60 items/sec | 카드번호 형태 유지 암호화를 초당 약 9만 개 처리 |

### API 요청 처리량 기준

이 표는 Vault API 요청을 초당 몇 건 처리했는지를 기준으로 정리한 것이다. API Gateway, application request pattern, Vault endpoint 호출량을 볼 때 참고하면 된다.

| Scenario | Max TPS Case | TPS | Item Throughput | Avg Latency | Max Latency |
| --- | --- | ---: | ---: | ---: | ---: |
| Transit Encrypt | batch 20, T/C 128 | 10,286.19 | 205,723.80 | 24.26ms | 405.75ms |
| Transit Decrypt | batch 20, T/C 128 | 9,932.21 | 198,644.20 | 22.89ms | 340.84ms |
| Transform FPE Encode | batch 20, T/C 128 | 3,862.95 | 77,259.00 | 49.19ms | 618.41ms |

## 9. 1000만 개 부하 테스트

이 테스트는 순간 TPS보다 `총 10,000,000개 이상의 데이터를 Vault가 처리할 수 있는지`를 확인하는 테스트다.

적용한 조건은 다음과 같다.

| 항목 | 값 | 의미 |
| --- | --- | --- |
| Batch Count | 320 | API 요청 1건에 데이터 320개를 담음 |
| Threads | 128 | 128개 작업자가 동시에 요청 생성 |
| Connections | 128 | Vault API로 128개 연결을 유지 |
| Chunk Duration | 20s | 20초 단위로 실행 결과를 끊어서 집계 |
| Target Items | 10,000,000 | 총 1000만 개 이상 처리되면 테스트 종료 |

결과가 정확히 10,000,000에서 멈추지 않고 더 크게 나온 이유는 20초 chunk가 끝날 때까지 실행한 뒤 누적 개수를 계산했기 때문이다.

| Scenario | Total Requests | Total Items | Chunks | Avg Requests/sec | Avg Items/sec | Result Directory |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Transit Encrypt | 57,809 | 18,498,880 | 2 | 1,437.98 | 460,153.60 | `/opt/vault-benchmark/results/20260623T085859Z-ten-million-transit-encrypt-320` |
| Transform FPE Encode | 35,563 | 11,380,160 | 6 | 294.87 | 94,358.93 | `/opt/vault-benchmark/results/20260623T085942Z-ten-million-transform-fpe-encode-320` |

해석:

- Transit Encrypt는 2개 chunk 동안 총 `18,498,880`개를 처리했다. 관측 평균 기준으로는 초당 약 `460,153`개 수준이다.
- Transform FPE Encode는 6개 chunk 동안 총 `11,380,160`개를 처리했다. 관측 평균 기준으로는 초당 약 `94,358`개 수준이다.
- 두 테스트 모두 `10,000,000`개 이상 처리 조건을 만족했다.
- Transform FPE는 Transit보다 처리량이 낮지만, 이는 카드번호 형태를 유지하는 암호화 특성상 더 무거운 연산이기 때문이다.

## 10. 테스트 후 Vault 상태

| 항목 | 결과 |
| --- | --- |
| Vault Sealed | `false` |
| HA Mode | `active` |
| Raft Peer Status | `3 voters` |
| Post-test Check | Vault cluster remained initialized, unsealed, and active after benchmark. |

해석: 부하 테스트 후에도 Vault 클러스터는 정상 상태를 유지했다. 즉, 이번 테스트 범위에서는 benchmark 실행으로 인해 Vault가 seal되거나 Raft 구성이 깨지는 현상은 없었다.

## 11. CPU 참고 지표

CloudWatch `AWS/EC2 CPUUtilization` 기준 최근 약 45분 구간의 평균/최대값이다.

| Instance | Role | Avg CPU | Max CPU |
| --- | --- | ---: | ---: |
| `i-0711d6a1adb0e1609` | Vault leader | 21.71% | 84.60% |
| `i-01d934cd430ab6576` | Vault follower 1 | 0.90% | 1.70% |
| `i-013740958d1b26329` | Vault follower 2 | 0.86% | 1.04% |
| `i-0892a214dc539c83f` | Benchmark runner | 2.45% | 21.75% |

해석: 이번 테스트는 Vault leader endpoint로 직접 부하를 넣은 결과라 leader CPU 사용률이 가장 높고 follower CPU는 낮게 관측됐다. 실제 운영 환경에서는 load balancer, client routing, standby read, audit device, network path 구성에 따라 CPU 분포가 달라질 수 있다.

## 12. 실행 명령

```bash
prepare-pdf-style-data
DURATION=5s run-pdf-style-matrix
SCENARIO=transit-encrypt BATCH_COUNT=320 TARGET_ITEMS=10000000 THREADS=128 CONNECTIONS=128 CHUNK_DURATION=20s run-ten-million-load
SCENARIO=transform-fpe-encode BATCH_COUNT=320 TARGET_ITEMS=10000000 THREADS=128 CONNECTIONS=128 CHUNK_DURATION=20s run-ten-million-load
```

## 13. 최종 해석 메모

- Batch Count가 커질수록 HTTP TPS는 낮아지지만, 초당 처리 데이터 항목 수는 증가하는 구간이 있다.
- Transit은 batch 320 고동시성에서 약 45만 items/sec 수준까지 관측됐다.
- Transform FPE는 batch 320 고동시성에서 약 9만 items/sec 수준까지 관측됐다.
- Vault leader CPU 최대값은 84.60%로 관측됐고, follower CPU는 낮았다. 현재 테스트는 leader endpoint로 직접 부하를 넣은 결과다.
- PDF 원본과 동일한 60초/케이스 테스트가 필요하면 `DURATION=60s run-pdf-style-matrix`로 재실행한다.
- 고객 설명 시에는 `requests/sec`보다 `items/sec`를 중심으로 설명하는 것이 이해하기 쉽다. 고객의 관심사는 API 요청 수보다 실제 암호화/복호화 데이터 처리량일 가능성이 높다.
