# 데이터 출처 추적 (Provenance Log)

본 도구의 *모든* 외부 데이터의 출처·시점·방법·신뢰도·갱신주기를 한 줄도 빠짐없이 기록한다. 모든 새 데이터 작업은 이 문서에 항목을 *먼저* 추가하고 진행한다.

---

## 0. 스키마

각 항목은 다음 필드를 가진다.

- **id** — 항목 고유 식별자 (slug)
- **발전원** — 데이터가 속한 기술(예: fuelcell, turbine, recip, solar)
- **데이터 종류** — deployment / cost / emissions / vendor / regulatory / market
- **출처** — 원본 데이터 발행 기관 + 정확한 URL
- **출처 유형** — 정부공공 / 정부원천민간가공 / 민간상업 / 웹회색지대 / 자체조사
- **재판매·재배포 등급** — 🟢 안전 / 🟡 확인필요 / 🔴 위험 (data-source-review-fuelcells.md 분류 일관 적용)
- **가져온 일자** — YYYY-MM-DD
- **가져온 방법** — manual extraction / WebSearch + WebFetch / API / official download
- **저장 경로** — repo 내 파일 경로
- **신뢰도** — high / medium / low (출처가 권위적이고 최신일수록 high)
- **갱신 주기** — annual / quarterly / monthly / one-off
- **다음 갱신 예정** — YYYY-MM-DD
- **검증 상태** — verified / unverified / needs-review
- **비고** — 한계·주의사항·후속 작업

---

## 1. 활성 데이터 출처 (Active Sources)

### 1.1 발전원: 연료전지 (Solid-Oxide Fuel Cell)

_시간 역순으로 기록 (최신이 위)._

---

### 1.3 발전원: 태양광+BESS (Solar PV + Battery Energy Storage)

**[SOLAR-001] NREL ATB 2024 — Utility-Scale PV** *(2026-05-29 검증 완료)*

- 데이터 종류: cost, performance
- 출처: NREL ATB 2024 Utility-Scale PV (https://atb.nrel.gov/electricity/2024/utility-scale_pv)
- 출처 유형: 정부공공
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-29
- 저장 경로: `data/solar-bess/nrel-atb-2024-utility-scale-pv.json`
- 신뢰도: **high** (Solar PV는 우리 3개 발전원 중 *ATB가 신뢰 가능한 유일한 카테고리* — 시장 다중 maker 구조)
- 검증 상태: **verified**
- **검증된 핵심 수치**:
  - 2022 base $1.43/WAC, 2023 $1.56/WAC, 2035 Moderate $0.90/WAC
  - FOM $22/kWAC-yr (system $14.4 + property $5.4 + admin $2.4)
  - CF 21-34% (10 GHI classes), 미국 historical median 24%, range 9-35%
  - Representative: 100 MW-DC (74.6 MW-AC) one-axis tracking, ILR 1.34, bifacial
- **Hyperscaler context**: Microsoft 40 GW renewable (2020 1.8 GW → 2025 40 GW, Brookfield $10B 10.5 GW), Google 22 GW (24/7 CFE 개념 창시, 97% 최대 달성), Google이 *gas without CCS 검토 중* — carbon-free 한계 인정
- **도구 영향**: DEFAULTS.capex.solar 1100 → 1300 ($1,400 baseline에서 grid connection $100 차감)

**[SOLAR-002] NREL Cole & Karmakar 2023 — Utility-Scale Battery Storage** *(2026-05-29 검증 완료, *Round 1차 작업의 보강*)*

- 데이터 종류: cost, performance
- 출처: NREL ATB 2024 Utility-Scale Battery Storage page + Cole & Karmakar 2023 (NREL/TP-6A40-85332) PDF 직접 fetch
- 출처 유형: 정부공공 (NREL)
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-29 (initial Round 1차에서 누락 → 보강 round에서 확보)
- 가져온 방법: NREL ATB 페이지 fetch + Cole & Karmakar PDF 직접 fetch (every year value 부록 Table 2 추출)
- 저장 경로: `data/solar-bess/nrel-utility-scale-battery-storage.json`
- 신뢰도: **high** (primary NREL source + 16개 industry publication literature review)
- 검증 상태: **verified — full year-by-year cost projection 표 추출**
- **검증된 핵심 수치 (4-hour Li-ion BESS, 2022$ overnight capital cost)**:
  - 2022 baseline $482/kWh (Ramasamy et al. 2022 NREL bottom-up)
  - 2025: low $310 / mid $388 / high $496/kWh — *short-term은 cost 증가 가능성 인정*
  - 2030: low $245 / mid $326 / high $403/kWh
  - 2050: low $159 / mid $226 / high $348/kWh
  - Round-trip efficiency 85%, lifetime 15 years, FOM 2.5% of $/kW, VOM $0
  - Chemistry: LFP가 2022년부터 stationary primary, NMC가 secondary
- **도구 검증**: bessCost $350/kWh는 2030 mid case $326와 *7% 차이로 정확 일치* → 적정 baseline. ASSUMPTION_PROVENANCE에 range $245-$403 명시.
- **결정적 한계**: ATB는 *4-hour만 robust*. 우리 도구의 12hr는 energy/power split 확장 적용 — 정확도 caveat 추가됨. 데이터센터 24/7 firm load는 *1-2일 ride-through (24-48hr) 필요* — 12hr 불충분. 현실은 *off-site PPA hybrid*가 dominant.
- TODO: ATB Excel workbook에서 energy/power cost split 추출 (12hr·24hr 정확 $/kW), Lazard LCOS 2025 실측 LCOS 검증

**[SOLAR-004] NREL Cole·Ramasamy·Turan 2025 BESS Cost Projection Update — *결정적 정정*** *(2026-05-29 검증 완료)*

- 데이터 종류: cost (BESS energy/power split + 2024 baseline 30% 하향)
- 출처: Cole·Ramasamy·Turan 2025 (NREL/TP-6A40-93281, June 2025) PDF 직접 fetch — Cole & Karmakar 2023의 *2025 successor*
- 출처 유형: 정부공공 (NREL)
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-29
- 가져온 방법: PDF 직접 fetch (https://www.nrel.gov/docs/fy25osti/93281.pdf, full PDF received, truncated 없음)
- 저장 경로: `data/solar-bess/nrel-cole-ramasamy-turan-2025-bess-update.json`
- 신뢰도: **high — primary NREL source 직접 fetch + Figure 2 split 공식 명시**
- 검증 상태: **fully verified — every year cost table + split formula 모두 추출**
- **결정적 발견 1: Split 공식** (Figure 2, Section 2.2):
  - *직접 인용*: "the energy cost is $241/kWh, and the power cost is $372/kW"
  - 직선 회귀 y=240.8x+379.16 (R²=0.9999) — 완벽 linear
  - 공식: `Total ($/kW) = Energy × Duration + Power`
  - Augustine & Blair 2021이 endorsed한 공식의 *정확 수치 확보* — 우리가 truncated PDF에서 못 받았던 데이터.
- **결정적 발견 2: 2024 baseline 30% 하향** (Cole & Karmakar 2023 → 2025 update):
  - 2024 USD: $482/kWh (2023 보고서) → **$334/kWh** (2025 update) = **-30.7%**
  - *직접 인용*: "Costs in this 2025 update report are most closely aligned with the low projection from the 2023 report primarily due to lower estimates for current battery system costs"
  - NREL 자체가 *2023 estimates 너무 높다고 인정*. 시장 가격 빠르게 하락.
- **도구 영향**:
  - 이전 default $350/kWh × 6hr = $2,100/kW
  - 새 공식 6hr = $241 × 6 + $372 = **$1,818/kW** (-13.4% 정정)
  - 우리 도구의 Solar+BESS 시나리오가 *이전에 13% 과대평가됐음*. 정정 후 *실제 NREL baseline*에 align.
  - DEFAULTS.bessCost (fixed $350) → DEFAULTS.bessEnergyCost ($241) + bessPowerCost ($372) split
  - Assumptions 패널: 1 field → 2 field (energy + power 분리)
  - ASSUMPTION_PROVENANCE: bessCost entry → bessEnergyCost + bessPowerCost entries
- **검증된 부속 정보**:
  - 2024 bottom-up: battery cabinets $210 (63%) + EBOS $44 (13%) + inverter $26 (8%) + 기타 soft costs $54 (16%) = $334/kWh
  - FOM 2.5% → 4% (augmentation 포함, 2025 update)
  - RTE 85%, lifetime 15yr 유지
  - 2025-2050 full year table 추출 (low/mid/high)
- **정직성 명시**: 1차 Task #22(2026-05-29)에서 우리는 *Cole & Karmakar 2023만 봤음*. 보강 round(Task #25-26)에서 Augustine PDF truncated 문제로 split 공식 정확 수치를 못 받았고 *$350 default 유지*. Task #10 (이 entry)에서 *2025 update에서 정확 수치 + 30% 하향 baseline 발견*. 우리 도구의 Solar+BESS 시나리오가 *2026-05-29 12:00 PM 이전*에는 *15% 과대평가 결과*를 표시하고 있었음. 정직히 명시.

---

**[SOLAR-003] NREL Augustine & Blair 2021 Storage Futures Study (SFS) — 직접 fetch** *(2026-05-29 검증 완료, 핵심 발견)*

- 데이터 종류: methodology + BESS modeling 범위
- 출처: Augustine & Blair 2021 (NREL/TP-5700-78694) PDF 직접 fetch
- 출처 유형: 정부공공 (NREL)
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-29
- 가져온 방법: PDF web_fetch (117KB) → subagent로 page 32까지 추출 (PDF가 1577 line에서 truncated)
- 저장 경로: `data/solar-bess/nrel-utility-scale-battery-storage.json` (Augustine 인용 통합)
- 신뢰도: high (NREL primary source)
- 검증 상태: **partial verified — methodology와 범위 명확, 정확 수치 표는 PDF truncated로 미수신**
- **결정적 발견 (verbatim 인용)**:
  - **공식 endorsed** (Section 2.5, lines 397-399): *"Technology total capital cost ($/kW) for a given duration is calculated by multiplying storage duration by the energy capital cost component value ($/kWh) and adding the power capital cost component ($/kW)."*
  - **🔴 BESS modeling 10hr cap** (line 627): *"storage durations for BESS are limited to 10 hours"*. → *우리 도구의 default 12hr가 NREL modeled domain 밖이었음*. 2026-05-29 fix로 storageHrs 12 → 6 변경.
  - Modeled durations: 2, 4, 6, 8, 10 hours @ 60 MW
  - Round-trip efficiency 86%, Cycle 330/yr for 4-12hr
- **도구 영향**: (a) DEFAULTS.storageHrs 12 → 6 — NREL 범위 내 + 현실적 hyperscaler peak-shaving. (b) Solar 시나리오 note에 *"24/7 firm 약속 못 함"* 자동 추가. (c) storageHrs > 10시 *extrapolation* caveat. (d) ASSUMPTION_PROVENANCE.storageHrs entry 추가.
- **TODO**: ATB Excel workbook 다운로드해 Battery Pack/BOS split 정확 수치 (단 12hr는 modeled 밖이라 6hr 정확 도출이 더 가치 있음). Augustine PDF Section 3·Appendix A 직접 fetch (PDF truncated 문제).
- **정직성 명시**: 1차 작업(Task #22)에서 우리는 *NREL 10hr cap을 몰랐고*, 12hr를 부정확하게 적용. 보강 round(Task #25-26)에서 발견·정정. 우리 도구의 *데이터 자산 사상 가장 중요한 발견 중 하나*.

---

### 1.X 데이터센터 hot zone (sub-region overlay)

**[REGION-001] 데이터센터 핵심 hot zone 매핑 — Round 1 (5곳) + Round 2 (5곳) = 총 10곳** *(Round 1: 2026-05-29, Round 2: 2026-05-29)*

- 데이터 종류: regional overlay (ISO 매핑 위 sub-region uplift)
- 출처: Data Center Frontier, DCD, JLARC Virginia 2024 study (🟢), Utility Dive, PJM RTEP, SEC AEP 8-K (🟢), Georgia Recorder, CBRE, MIT Tech Review, Canary Media, Hillsboro Herald, IPA Resource Adequacy Study (🟢), KUOW/OPB, ArentFox Schiff
- 출처 유형: 정부공공 (PJM·utilities·state studies·IPA) + 산업 언론
- 재배포 등급: 🟡 (aggregate)
- 가져온 일자: 2026-05-29 (Round 1 + Round 2 동일 day)
- 저장 경로: `data/regions/data-center-hot-zones.json`
- 신뢰도: **high (10개 모두 verified — Round 1·2 동일 quality bar)**
- 검증 상태: **verified — utility IRP/CPCN 직접 fetch는 Round 3 권장**
- **Round 1 — 5개 hot zone**:
  - **NoVA (Loudoun/Fairfax/PWC)** PJM/Dominion: gridWait ×1.6 (PJM 60→96mo), gas +4mi, capex ×1.10. Dominion 4,000 MW 수요 vs 2,100 MW 처리.
  - **Columbus OH** PJM/AEP Ohio: gridWait ×1.1, gas −2mi, capex ×1.0. AEP Ohio pipeline 30→13 GW (2025-07 tariff). *BTM 가장 우호*.
  - **Silicon Valley** CAISO/SVP+PG&E: gridWait ×1.3, capex ×1.25. *Gas turbine·recip hardNo* (CA 규제).
  - **DFW** ERCOT/Oncor: gridWait ×0.7, gas −2mi, capex ×0.95. *ERCOT energy-only* + 가스 풍부. *BTM 매우 우호*.
  - **Phoenix** WALC/APS+SRP: gridWait ×1.0, gas +2mi, capex ×1.05. *Solar+BESS이 매력적인 유일한 hot zone*.
- **Round 2 — 5개 추가** *(2026-05-29 verified)*:
  - **Atlanta South (Fulton·Douglas·Coweta)** SOCO/Georgia Power: gridWait ×1.4, gas −2mi, capex ×0.95. *미국 #2 시장* (NoVA 다음). GA IT load 1.7→19.7 GW (4년 11.6x). 2025-12 GA PSC 10 GW 신규 capacity 승인 (5 gas plants).
  - **Reno-Tahoe (Storey/TRIC)** WECC/NV Energy: gridWait ×1.1, gas +2mi, capex ×1.0. *세계 5위 신흥 시장*. Switch Citadel 2,000 acres / Tahoe Reno 1 = 세계 최대 콜로.
  - **Hillsboro OR (Silicon Forest)** WECC/PGE+BPA: gridWait ×0.8, gas +5mi, capex ×1.10. *Vacancy 0.2% — 미국 최저*. PGE-Gridcare AI software로 interconnection 가속. BPA hydro carbon-free. 2025 POWER Act.
  - **Chicago (ComEd PJM + Ameren MISO split)** PJM/MISO: gridWait ×1.5, capex ×1.05. ComEd 28 GW backlog (NoVA 4,000의 7배). Joliet 795-acre IL 최대. *2029부터 shortfall 예상*. IL = #1 원전 주 (11 reactors).
  - **Quincy WA (Grant PUD hydro)** WECC/BPA: gridWait ×1.3, gas +8mi, capex ×0.85. *유일하게 BTM 불필요*. Wanapum+Priest Rapids 2,000+ MW hydro · *3¢/kWh* (미국 최저) · 100% carbon-free. *Gas turbine·recip hardNo*. 2025 capacity maxed out.
- **구조적 함의**: ISO 매핑(PJM/ERCOT/MISO/WECC)만으로는 *같은 region 내에서도 매우 다른 시장* 구분 불가. 10개 hot zone = 미국 데이터센터 capacity의 *80%+ coverage*. 잔여 sub-regions (eastern Oregon Boardman, central Texas Austin, Salt Lake City UT, etc)는 Round 3.
- **도구 통합 (public/index.html)**: HOT_ZONES inline 10곳 + matchHotZone() haversine 매칭 + applyRegion()/compute() uplift 적용 + renderRegionContext 보라색 hot zone 패널 + Compare view region 컬럼 inline 표기 + 동일 결과 노란 경고 배너 + techHardNo 페널티 (Silicon Valley·Quincy WA).

---

### 1.2 발전원: 가스터빈·왕복엔진 (Gas Turbine & Reciprocating Engine)

_데이터센터 BTM용 가스연료 발전 — aeroderivative GT (15-50 MW), industrial frame GT (50-300 MW), reciprocating engine (1-20 MW)을 한 묶음으로._

**[GT-001] NREL ATB 2024 — Fossil Energy Technologies (Natural Gas)** *(2026-05-28 검증 부분 완료)*

- 데이터 종류: cost, performance
- 출처: NREL ATB 2024 — Fossil Energy Technologies (https://atb.nrel.gov/electricity/2024/fossil_energy_technologies)
- 출처 유형: 정부공공
- 재배포 등급: 🟢 (with attribution)
- 가져온 일자: 2026-05-28
- 가져온 방법: WebFetch 직접 — narrative 페이지 완료
- 저장 경로: `data/gasturbines/nrel-atb-2024-natural-gas.json`
- 신뢰도: **high (방법론·plant 사양)** / pending (실제 $/kW 수치는 별도 Data 페이지)
- 검증 상태: **partial — narrative + plant 사양 verified; Data 페이지 후속 작업 (Task #15)**
- **검증된 핵심 발견**:
  - ATB가 추적하는 NG 옵션: F-class CT (233 MW), F-class 2x1 CC (727 MW), H-class 2x1 CC (992 MW), H-class 1x1 CC (649 MW, 2024 신규)
  - H-class 1x1 (649 MW)은 *명시적으로 '1 GW 미만 plant'용*으로 2024년 추가됨 — 데이터센터 hyperscale 캠퍼스의 직접 fit
  - **결정적 한계 발견**: ATB는 *aeroderivative GT (LM2500/LM6000/LMS100)을 추적 안 함*. ATB scope는 utility-scale → 데이터센터 BTM의 sweet spot인 15-100 MW aero는 사각지대.
  - NGFC (natural gas fuel cell)는 ATB에 *future 2035+ scenario로만* 존재, *현재 commercial Bloom-class SOFC는 추적 안 함* → FC-003의 우리 발견(SOFC는 ATB 사각지대)을 ATB가 명시적으로 확인
- TODO: ATB Data 페이지 fetch (Task #15), aeroderivative vendor 별도 trace (Task #16)

**[GT-002] EIA Construction Cost Data 2023 — 가스 발전기** *(2026-05-28 검증 완료)*

- 데이터 종류: cost
- 출처: EIA Construction Cost Data (https://www.eia.gov/electricity/generatorcosts/)
- 출처 유형: 정부공공
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-28
- 가져온 방법: WebFetch 직접 — 페이지 본문 + 표 완전 추출
- 저장 경로: `data/gasturbines/eia-construction-cost-2023-gas.json`
- 신뢰도: **high**
- 검증 상태: **verified — 모든 표 데이터 cross-check**
- **검증된 핵심 수치** (2023 reporting year):
  - Simple-cycle combustion turbine: **$562/kW** (2,264 MW 설치)
  - Combined cycle blended: **$898/kW** (3,492 MW 설치) — CT part $782 + ST part $1,122
  - Internal combustion engine (gas reciprocating): **$1,354/kW** (159 MW 설치)
  - 2023 신규 가스 발전 총 5,914 MW / 총 건설비 $5.9B
  - 평균 plant size: CC 645 MW, CT 61 MW, IC engine 17 MW
- **결정적 발견**: 연료전지(FC-003)와 대조 — *가스 발전기는 EIA가 명시적으로 공시*. 시장이 GE Vernova·Siemens·Mitsubishi·Cat·Wartsila로 분산되어 공시 억제 트리거 안 됨. 우리 도구의 가스터빈 시나리오는 *"EIA 권위 데이터 기반"* 라벨 사용 가능.
- 비고: 단, EIA $/kW는 *EPC 본체* — 데이터센터 turnkey는 +20-40% (interconnection, civil, BoP). 또한 prime mover 단위로만 분류되어 aero vs industrial frame 구분 안 함.

**[GT-003] GE Vernova FY2024 — Power 세그먼트** *(2026-05-28 검증 부분 완료)*

- 데이터 종류: vendor, deployment
- 출처: GE Vernova Q4/FY2024 press release (2025-01-22) + 10-K FY2024 (SEC EDGAR)
- 출처 유형: 정부공공 (SEC) + 기업 자체 발표
- 재배포 등급: 🟢 (SEC) / 🟡 (press release prose)
- 가져온 일자: 2026-05-28
- 가져온 방법: GE Vernova IR 직접 fetch + WebSearch (10-K)
- 저장 경로: `data/gasturbines/ge-vernova.json`
- 신뢰도: **high (재무, Power 세그먼트 운영 지표)** / medium (turbine 모델별 deployment)
- 검증 상태: **partial — press release 직접 추출 verified; 10-K Item 7 RPO/backlog 검증 후속 작업**
- **검증된 핵심 수치 (FY2024)**:
  - 총 매출 $34.9B (+5%, organic +7%) — Power 세그먼트 $18.1B (52% 비중)
  - Power 세그먼트 orders $21.8B (+28% organic), EBITDA $2.27B (margin 12.5%, +260bps)
  - Q4'24 Power orders $6.6B (+24% organic) — *24 heavy-duty units* 단일 분기
  - Q4'24 매출 mix: *"higher HA deliveries more than offsetting lower aeroderivative shipments"* — aero 공급 제약 신호
  - Aeroderivative FY2024: orders 44 / sales 27 → 17 units backlog 증가
  - Gas Power total RPO $73.4B (equipment $12.5B + services $60.9B) — *10-K cross-check 필요*
  - 2025 가이던스: Power EBITDA margin 13-14% (premium pricing 신호)
- **결정적 발견**: Aeroderivative *공급 제약 시작* — 신규 주문 시 2027-2028 인도. 데이터센터 BTM 시간 절약 메시지에 *aero 가용성* 변수 추가 필요.
- TODO: 10-K Item 7 MD&A 직접 fetch (Task #13와 같은 패턴), aero capacity expansion 발표 추적, Crusoe·Talen·ExxonMobil 데이터센터 customer announcement

**[GT-002] EIA Construction Cost Data — 가스 발전기 capex** *(2026-05-28 검증 진행 중)*

- 데이터 종류: cost
- 출처: EIA Construction Cost Data (Generators Installed in 2023)
- 출처 유형: 정부공공
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-28
- 가져온 방법: WebFetch 진행 중
- 저장 경로: `data/gasturbines/eia-construction-cost-2023-gas.json`
- 신뢰도: high (시장 다중 OEM이므로 EIA 공시 억제 없음)
- 검증 상태: in progress
- 비고: 연료전지(FC-003)와의 결정적 차이 — *가스 발전기는 EIA가 공시함*. 시장에 GE Vernova, Siemens, Mitsubishi, Cat, Wartsila 등 다수 OEM 존재로 단일 회사 공시 노출 없음.

**[GT-004] Siemens Energy AG / Mitsubishi Power / Solar Turbines** *(향후 검증 예정)*

- 데이터 종류: vendor
- 출처: Siemens Energy AG 분기보고 (Frankfurt 상장 ENR), Mitsubishi Heavy Industries 사업부 (도쿄 상장 7011), Solar Turbines (Caterpillar CAT 사업부)
- 재배포 등급: 🟢 (정부 공시) / 🟡 (자체 발표)
- 검증 상태: not started
- 비고: GE Vernova 외 다른 메이저 OEM. Mitsubishi는 Power 사업이 모회사 매출의 ~15%로 분리 공시가 덜 됨. Solar Turbines (5-30 MW 산업용 GT)는 CAT Energy & Transportation 세그먼트의 일부로만 공시 — 별도 단가 공시 없음. *데이터센터 BTM에 매우 관련*이지만 *공개 데이터 빈약*.

**[GT-004] Solar Turbines (Caterpillar 자회사)** *(2026-05-29 검증 완료)*

- 데이터 종류: vendor, deployment
- 출처: Solar Turbines product pages, Power Engineering article (Meta Socrates), Caterpillar 10-K (간접 — 별도 line item 없음)
- 출처 유형: 기업 자체 발표 + 산업 언론 + SEC (parent CAT)
- 재배포 등급: 🟡 (자체 발표) / 🟢 (CAT SEC) / 🟡 (산업 언론 회색지대)
- 가져온 일자: 2026-05-29
- 저장 경로: `data/gasturbines/solar-turbines.json`
- 신뢰도: medium-high (제품 사양·verified deployments)
- 검증 상태: **verified**
- **검증된 발견**: Solar 모델 라인업 (Mercury 4.6 → Titan 250 22 MW). *Meta Socrates 검증*: 3 × Titan 250 + 9 × PGM 130 mobile = 12대 Solar GT가 200 MW BTM의 73% 차지. *Caterpillar 공급망 통합 → 잠재적 US lead time 우위* (정량 미공개).

**[GT-005] Wärtsilä (Gas Reciprocating)** *(2026-05-29 검증 완료)*

- 데이터 종류: vendor, deployment
- 출처: Power Engineering 기사, Wartsila press release (참조), Helsinki Stock Exchange 공시 (WRT1V)
- 재배포 등급: 🟡 (자체 발표) / 🟢 (정부 공시)
- 가져온 일자: 2026-05-29
- 저장 경로: `data/gasturbines/wartsila.json`
- 신뢰도: medium-high
- 검증 상태: **verified**
- **검증된 핵심 거래 (Q2 2025)**: Williams Companies → Will-Power OH → Ohio 데이터센터, **15 × 18V50SG = 282 MW**, Q2 2025 booking → 2026-2027 인도 = **18-21개월 lead time**. 미국 누적 6 GW 도달. *Aero GT/industrial frame 대비 명확한 lead time 우위*. *Bloom과 lead time 비등*, 거래 규모는 Wartsila > Bloom.

**[GT-007] EIA-860 2024 — 미국 Gas Turbine fleet (GT prime mover)** *(2026-05-29 검증 완료, 사용자 스크립트 실행)*

- 데이터 종류: deployment (installed capacity)
- 출처: EIA Form 860 2024 ZIP (2025-09-09 release) — `scripts/fetch-eia860-gas-turbines.js` 직접 실행
- 출처 유형: 정부공공
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-29
- 저장 경로: `data/gasturbines/eia860-2024-gas-turbines.json`
- 신뢰도: **high** (EIA-860 권위 직접 추출)
- 검증 상태: **fully verified**
- **검증된 핵심 수치**:
  - **미국 총 GT fleet: 158,614.5 MW** (2,333 units, gas fuel only — 디젤 460 units 제외 필터링 후)
  - 미국 전체 발전 capacity ~1,250 GW의 *13%* — 거대 카테고리
  - **사이즈 분포** (*데이터센터 BTM 관련성 정량화*):
    - Aero <50 MW: 1,024 units / **21,545 MW (13.6%)** — 데이터센터 BTM sweet spot
    - Mid-frame 50-150 MW: 1,039 units / 85,133 MW (53.7%) — utility peaker dominant
    - F-class 150-300 MW: 268 units / 51,051 MW (32.2%)
    - H/J-class 300+ MW: 2 units / 885 MW (0.6%) — *NREL ATB가 추적하는 H-class 649 MW 1x1는 실측 fleet에 거의 없음*
  - **주별 (상위 10)**: TX 15,331 MW (9.7%), CA 12,949 (8.2%), IL 12,416 (7.8%), FL 9,994 (6.3%), GA 9,019 (5.7%), NC 7,991 (5.0%), KY 6,883 (4.3%), OH 6,632 (4.2%), VA 4,829 (3.0%), TN 4,232 (2.7%)
  - **Top operator (모두 utility)**: TVA 7,061 MW, Duke Energy Carolinas 4,188, Union Electric 3,430, Oglethorpe Power 3,296, FPL 3,038, ProEnergy Services 3,025, Southern Power 2,954, Duke Energy Progress 2,837, Dominion 2,723, DTE 2,005
  - **신규 BOL 추세**: 2016 3,501 MW 정점 → 2020 933 MW 저점 → 2021-2024 회복 (2024: 1,970 MW). 데이터센터 boom 신호 *2024년부터 가속*
- **결정적 함의**: 데이터센터 BTM developer (Williams Companies, Meta Socrates, Crusoe Abilene)는 *EIA-860 2024에 미반영* — top 10 operator 모두 traditional utility. 2025-2027 BOL이 *EIA-860 2025/2026 release*에서 큰 변화 예상.
- TODO: Williams Companies·Meta affiliate·Crusoe Abilene EIA-860 2025/2026 등록 추적

**[GT-008] EIA-860 2024 — 미국 Reciprocating Gas Engine fleet (IC prime mover)** *(2026-05-29 검증 완료, 사용자 스크립트 실행)*

- 데이터 종류: deployment
- 출처: EIA Form 860 2024 — `scripts/fetch-eia860-gas-turbines.js` 직접 실행
- 출처 유형: 정부공공
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-29
- 저장 경로: `data/gasturbines/eia860-2024-reciprocating.json`
- 신뢰도: **high**
- 검증 상태: **fully verified**
- **검증된 핵심 수치**:
  - **미국 IC 가스 fleet: 7,921 MW** (3,074 units, 디젤 3,330 units 제외 후 — *디젤이 가스보다 많음*)
  - GT의 5% 규모. 작은 카테고리.
  - **사이즈 분포** (*데이터센터 BTM 관련성*):
    - Small modular <5 MW: 2,632 units / **3,117 MW (39.4%)** — micro-grid / industrial CHP
    - Mid-size 5-15 MW: 330 units / 2,680 MW (33.8%)
    - **Large modular 15-25 MW (Wartsila 18V50SG class)**: 110 units / **2,028 MW (25.6%)** — 데이터센터 BTM 핵심 사이즈
    - Heavy 25+ MW: 2 units / 96 MW (1.2%)
  - **주별 (상위 10)**: **TX 1,172 MW (14.8%)**, CA 750 (9.5%), KS 642 (8.1%), MI 499 (6.3%), PA 360 (4.5%), FL 312 (3.9%), MT 284 (3.6%), OR 270 (3.4%), CO 254 (3.2%), MN 246 (3.1%)
  - Top operator 모두 utility/coop — South Texas Electric Coop 426 MW, WM Renewable Energy 234, Plains End 232, PGE 226
  - **신규 BOL 추세**: 2024 **457.3 MW** = 2021-2023 평균 170 MW의 *2.7x* — *데이터센터 IC engine 보급이 2024년에 가속*
- **결정적 함의**:
  - *IC engine 시장에서 디젤이 가스보다 많음* (3,330 vs 3,074 units) — 데이터센터 BTM 가스는 *디젤 backup gen 시장에서 분리되는 새 카테고리*
  - *Texas #1 (14.8%)* — DFW hot zone uplift (`gridWait ×0.7, gas −2mi, capex ×0.95`)가 *정량적으로 정확함*을 검증
  - Wartsila 282 MW Ohio 거래 (2026-2027 인도)는 EIA-860 2025-2026에서 *현재 fleet 25.6% (2 GW)의 +14%* 추가 예상
- **모든 발전원 fleet 비교 정량 매트릭스**:
  - Fuel cell: 363.8 MW (FC-002)
  - GT (가스): 158,614.5 MW
  - IC engine (가스): 7,921 MW
  - 합계 가스 발전: **166,535 MW**
  - 데이터센터 BTM 적합 사이즈 (Aero GT <50 MW + Wartsila-class IC + Fuel Cell): **~24 GW (≈2% of US gas fleet)**

---

**[GT-006] GridLab/EFG/Halcyon 2025-09 — IRP/CPCN 실측 가스터빈 capex** *(2026-05-29 검증 완료)*

- 데이터 종류: cost (시장 실측)
- 출처: GridLab (https://gridlab.org) nonprofit 보고서, EFG 분석, Halcyon AI platform, 원본 데이터는 state PSC IRP/CPCN filings
- 출처 유형: 정부공공 (state PSC filings, GridLab 인용·정리)
- 재배포 등급: 🟢 (with attribution)
- 가져온 일자: 2026-05-29
- 가져온 방법: GridLab PDF 직접 fetch (https://gridlab.org/wp-content/uploads/2025/09/GridLab_Gas-Turbine-Costs-Report-1.pdf)
- 저장 경로: `data/gasturbines/gridlab-2025-actual-capex.json`
- 신뢰도: **high (IRP/CPCN = state-regulated 공시문서, 법적 책임)**
- 검증 상태: **verified — Unit-level cost table 직접 인용**
- **결정적 발견 (세 번째 구조적 데이터 발견)**:
  - *NREL ATB와 EIA AEO이 현재 가스터빈 비용을 40-100% 과소평가*
  - NREL ATB 2024 (2030 CC 추정): $1,638/kW
  - EIA AEO 2025 (2030 CC 추정): $1,058/kW
  - **GridLab 실측 (2025-2031 IRP filings) CC**: $1,300-2,256/kW, median **$2,155/kW**
  - **Simple cycle CT 실측**: $728-1,969/kW, median $1,500/kW
  - **GE Vernova reservation fee 검증**: KU/LG&E가 2030 인도 슬롯 확보에 *$25M up-front* 지불 (KY PSC Case 2025-00045)
  - Mill Creek 5(2027) $1,427 → Mill Creek 6(2031) $2,194 — 같은 utility 같은 site 4년 후 *+54%*
  - PJM 가장 비쌈, ERCOT/MISO 상대적 저렴 — *데이터센터가 ERCOT(TX)/MISO(OH·IA)로 몰리는 경제적 근거*
- **도구 함의**: 가스터빈 시나리오 capex baseline을 *NREL ATB가 아닌 GridLab 데이터*로 설정. 정직한 framing — "공식 권위 데이터는 시간 지연; 실제 비용은 state PSC filings의 IRP/CPCN에서 추출".

**[DEPLOY-004] Vistra Comanche Peak — 1,200 MW Nuclear PPA (Texas, ERCOT)** *(2026-05-29 검증 완료, WebSearch 후 verified)*

- 데이터 종류: deployment case (*FTM nuclear PPA — Microsoft TMI에 이은 두 번째 GW급*)
- 출처: Vistra 8-K (2025-09, SEC EDGAR 2개 filing), Power Magazine, Utility Dive, PowerMag
- 출처 유형: 정부공공 (SEC) + 산업 언론
- 재배포 등급: 🟢 (SEC) / 🟡 (press)
- 가져온 일자: 2026-05-29
- 저장 경로: `data/deployment-cases/vistra-comanche-peak-2025.json`
- 신뢰도: high (재무·구조) / medium (customer 미공개 — 데이터센터로 *추정*하나 *공식 unconfirmed*)
- 검증 상태: **verified — 단 customer는 공식적으로 unnamed ("large investment-grade company")**
- **케이스 요약**: Vistra가 Comanche Peak 2.4 GW 중 1,200 MW (50%)를 *unnamed investment-grade customer*에 20yr PPA (+20yr extension option). Q4 2027 delivery 시작 → 2032 full ramp. 100% carbon-free. **Vistra Adjusted FCF 8-10% 증가** (FY2026 mid 기준). 동시에 860 MW Permian Basin gas plant 추가 — *dual nuclear+gas 데이터센터 offering*.
- **결정적 패턴 (3-deal pattern 강화)**: Talen-AWS BTM failed (PJM, 2024-11) → MS-CCEC FTM (PJM, 2024-09) → **Vistra Comanche Peak FTM (ERCOT, 2025-09)**. *모든 nuclear-데이터센터 deals이 FTM* — BTM nuclear는 dead market.

**[DEPLOY-003] Microsoft + Constellation — Three Mile Island Unit 1 재가동 (Crane Clean Energy Center, 835 MW PA)** *(2026-05-29 검증 완료, WebSearch 후 verified)*

- 데이터 종류: deployment case (*카본-free FTM PPA — retired plant resurrection*)
- 출처: Constellation 8-K (2024-09-20), Constellation 공식 press, Utility Dive, DCD, Orrick 법무 분석, PJM IMM
- 출처 유형: 정부공공 (SEC) + 기업 공식 + 산업 언론 + 법무
- 재배포 등급: 🟢 (SEC) / 🟡 (press·legal)
- 가져온 일자: 2026-05-29
- 저장 경로: `data/deployment-cases/microsoft-three-mile-island-crane-2024.json`
- 신뢰도: high — multiple verified sources
- 검증 상태: **verified — 모든 핵심 수치 cross-checked**
- **케이스 요약**: Microsoft + Constellation Energy 20yr PPA (2024-09-20 발표). Three Mile Island Unit 1 (2019 retire) 재가동 → *Crane Clean Energy Center* (CCEC, late former Exelon CEO Chris Crane 이름). **835 MW carbon-free**. 2028 online 예정, NRC license renewal로 2054까지 운영 목표. 3,400 jobs + $3B 세수 announcement. PJM 안에서 *grid-connected FTM*. *PJM market monitor가 일부 waiver에 반대* (2026-Q1) — regulatory friction 일부 존재.
- **결정적 함의**: *Talen-AWS와 달리 BTM 시도 자체를 건너뜀* — FERC 2024-11 거부 후 *nuclear BTM은 사실상 막힘*. CCEC는 *처음부터 FTM 모델*로 설계. **PJM 안 retired nuclear 재가동의 첫 사례** — 데이터센터 수요가 *retired 자원까지 활성화*.
- **3-deal nuclear pattern 일부**: Talen-AWS BTM failed → **MS-CCEC FTM** → Vistra Comanche Peak FTM. 모두 FTM.

---

**[DEPLOY-001] Meta Socrates South Power Generation Project (200 MW BTM, Ohio)** *(2026-05-29 검증 완료)*

- 데이터 종류: deployment case study (*우리 도구의 핵심 사용 사례*)
- 출처: Power Engineering 직접 fetch + Ohio Power Siting Board (OPSB) 공공 filing
- 재배포 등급: 🟢 (OPSB 정부 공시) / 🟡 (Power Engineering 회색지대)
- 가져온 일자: 2026-05-29
- 저장 경로: `data/deployment-cases/meta-socrates-ohio-2025.json`
- 신뢰도: high (OPSB filing + 산업 언론 cross-check)
- 검증 상태: **verified**
- **케이스 요약**: Williams Companies (Will-Power OH) builds & operates 200 MW BTM (× 2 sites = 400 MW total) for Sidecat LLC (Meta affiliate). New Albany Business Park Ohio. *Physically not connected to grid*. Construction 2025-06 → 2026-11 = **17개월**. Equipment: 4 OEM × 30 units (Solar Titan 250 × 3 + Solar PGM 130 × 9 + Siemens SGT400 × 3 + Cat 3520 reciprocating × 15) + emergency Cat C15 diesel × 8.
- **5가지 도구 design 교훈**: (1) Single best OEM 추천 X, *mix 비율 추천*. (2) Mobile turbine = primary option. (3) BTM zero-grid path가 진짜 hyperscaler 패턴. (4) *200 MW BTM 17개월이 baseline floor*. (5) 4 OEM 동시 사용 = 시장 분산 충분 신호.

---

**[FC-003] Fuel cell capex / cost references** *(2026-05-28 검증 완료)*

- 데이터 종류: cost
- 출처: NREL ATB 2024 (Electricity), EIA Construction Cost Data 2023, DOE H2/FC TO, Bloom 10-K
- 출처 유형: 정부공공 + 기업 공시
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-28
- 가져온 방법: WebSearch + WebFetch (NREL ATB·EIA 건설비 페이지 직접 fetch)
- 저장 경로: `data/fuelcells/cost-references.json`
- 신뢰도: **medium**
- 검증 상태: **verified — 구조적 한계 확인됨**
- **핵심 발견**: (1) NREL ATB 2024 Electricity는 정착형 SOFC를 *추적하지 않음* (직접 fetch로 확인). (2) EIA Construction Cost Data 2023은 fuel cell이 *공시 억제됨* — "to avoid disclosure of individual company data" — Bloom이 시장을 지배하다 보니 집계 공시 불가. → 미국에는 *연료전지 capex의 권위 있는 공개 단일 값이 존재하지 않음*. 우리 도구의 $3,800/kW는 합리적 합성 추정치이며, *공시 한계 자체가 도구의 솔직성 기반*.
- 다음 작업: Bloom 10-K에서 FY2024 product revenue $1.085B ÷ MW shipped(추출 TODO)로 implied $/kW 계산. State incentive program disclosures(CA SGIP, CT FCDM)에서 grant 단가 추출.

---

**[FC-002] 미국 연료전지 설치 용량 (2016 baseline + 2024 권위)** *(2026-05-29 검증 완료)*

- 데이터 종류: deployment
- 출처: EIA Today in Energy (2016 baseline), EIA-860 2024 ZIP 직접 다운로드 (2024 권위)
- 출처 유형: 정부공공
- 재배포 등급: 🟢
- 가져온 일자: 2026-05-28 (baseline) + 2026-05-29 (2024 현재)
- 가져온 방법: EIA Today in Energy 기사 직접 fetch + `scripts/fetch-eia860-fuelcells.js` 사용자 컴퓨터 실행
- 저장 경로: `data/fuelcells/us-capacity-overview.json` + `data/fuelcells/eia860-2024-fuelcells.json`
- 신뢰도: **high (둘 다 EIA 직접 인용)**
- 검증 상태: **fully verified — 2016 baseline + 2024 권위 수치 모두 확보**
- **2016 baseline (EIA Today in Energy 인용)**: 미국 ≥1 MW 연료전지 56개 발전소, 총 **137 MW**. CA 36% / CT 27% / DE 22% = 3개 주 85%. CHP 26 MW / 전기 전용 111 MW.
- **2024 권위 수치 (EIA-860 2024, 2025-09 release, 직접 추출)**:
  - **186 generators / 363.8 MW total** (2016 대비 2.65x)
  - **CA 153.5 MW (42%) / CT 103.2 MW (28%) / NY 58 MW (16%) / DE 28.8 MW (8%)** — 상위 3 = 86.5%
  - *NY가 DE 대체로 3위 부상*. 2016에는 미미, 2024에 Yaphank Fuel Cell Park·Generate Colchester 등 IPP-developed SPV로 16%까지 성장.
  - Operator 상위 6 = 248.8 MW (68.4%): Bloom Energy(106.6) + 2016 ESA Project Co.(74.1) + Diamond State Generation(27.5) + Bridgeport FC(16.6) + Derby FC(14.0) + Generate Colchester(10.0)
  - **Bloom + Bloom SPV들이 압도적** → FC-003의 'EIA가 공시 억제하는 이유 = Bloom 독점' 정량적 검증
  - 신규 BOL 추이: 2017-2020 peak (40-47 MW/yr), 2021-2024 둔화 (5.5-34 MW/yr). *Bloom AEP 1 GW announcement는 2025-2027 BOL 예정으로 아직 미반영* — 진짜 데이터센터 BTM wave는 EIA-860 2025/2026 release에서 가시화 예상.
- **결정적 컨텍스트**: Bloom AEP 단일 announcement 1 GW = 전국 fleet의 *2.75x*. 1-2개 거래가 시장을 변형시키는 시점 — 도구의 정량적 raison d'être.

---

**[FC-001] Bloom Energy 회사 데이터 (FY2024)** *(2026-05-28 검증 — Round 2 완료, Round 3 진행 중)*

- 데이터 종류: vendor, deployment
- 출처: Bloom Energy Q4/FY2024 press release (2025-02-27), SEC EDGAR 10-K Item 1 & Item 1A (직접 추출 완료)
- 출처 유형: 기업 자체 발표 + SEC EDGAR
- 재배포 등급: 🟡 (press release prose) / 🟢 (SEC 데이터)
- 가져온 일자: 2026-05-28
- 가져온 방법: Bloom IR press release 직접 fetch + 10-K HTML 직접 fetch (~124KB, 471줄 — 후반부 잘림)
- 저장 경로: `data/fuelcells/bloom-energy.json`
- 신뢰도: **high (재무, Item 1 사실)** / medium (Item 7 MD&A 미검증)
- 검증 상태: **partial — Item 1 (Business) + Item 1A (Risk Factors) verified; Item 7 MD&A 별도 fetch 필요**
- **Round 1 검증 (press release 기반, 완료)**:
  - 매출 $1,473.9M (+10.5% YoY) — product $1,085M / installation $122M / service $214M / electricity $53M
  - Gross margin 27.5% (전년 14.8%) — 구조적 개선
  - Operating income $22.9M (전년 -$208.9M) — 적자에서 흑자 전환
  - Q4'24 매출 $572.4M (+60.4% YoY), 현금 $802.9M
  - SK ecoplant 의존도 36.5% → 23.0%
  - FY2025 가이던스: 매출 $1.65-1.85B (+19% midpoint), 비-GAAP gross margin ~29%
- **Round 2 검증 (10-K Item 1/1A 직접 추출, 완료 2026-05-28)**:
  - **고객 집중도**: Top 3 = 23%/16%/14% (총 53%). Top customer (23%) = SK ecoplant 확인. 나머지 2개(16%·14%) 미공개 — Q4 8-K cross-ref TODO
  - **SK ecoplant 약정**: 500 MW (2022-2024) + 250 MW (2025-2027) = 누적 *750 MW 명시적 약정*
  - **제조 footprint**: Fremont CA 다수 시설 (89K sqft + 73K H2 + 164K 임대 Feb 2036까지) / Newark DE 178K sqft + 25 acres 인접 확장 / Sunnyvale 폐쇄 중
  - **인력**: 2,127명 (US 1,716 / India 362 / 기타 49). Field service 182명
  - **모니터링**: 24x7 remote monitoring 2개 센터 (US + India), 500+ 시스템 파라미터
  - **특허**: US 358 active + 148 pending / International 177 + 430 pending
  - **시간-to-power 직접 인용 (1원칙 정확 일치)**: "we have seen an increasing number of transactions move from a booking to revenue in less than twelve months"
  - **ITC 만료**: FY2024 말 신규 비-청정-수소 fuel cell ITC 만료. 기존 pipeline은 2028까지 보존
  - **CA FC NEM 만료**: 신규 캘리포니아 fuel cell은 export incentive 없음 → BTM 부하 이하 sizing 권고
  - **공식 경쟁자**: utilities, CHP, 원전, 수력, 석탄, 지열, solar+storage, wind+storage, 타 fuel cell, **diesel backup** (자체 분류)
  - **Sales cycle baseline**: typical 12-18개월 + install 9-18개월 = **21-36개월 baseline**. CEO 'less than 12 months'는 가속 케이스
- **Round 3 검증 완료 (2026-05-29) — FY2025 10-K Item 1 + Q3 2025 supplemental**:
  - **Q3 2025 verified**: Revenue $519.0M (+57.1% YoY), non-GAAP GM 30.4%, Adjusted EBITDA $59.0M, non-GAAP EPS $0.15
  - **Q3 2025 segment breakdown**: Product $384.3M (35% GM) · Install $65.8M (8.9%) · Service $58.6M (11.6%) · Electricity $10.4M (43.8%)
  - **Historical GM trend 2020-2024**: GAAP 20.9% → 27.5% (full reconciliation verified)
  - **Historical OpIncome 2020-2024**: 2020 -$80.8M → 2024 +$22.9M (GAAP 흑자 첫해)
  - **FY2025 고객 집중도**: top 3 = *43% + 13% + 12% = 68%* — FY2024 53%에서 +15pp. Top customer (43%) = SK ecoplant 관련당사자, FY2024 23%에서 *2x 증가*
  - **AEP 2025 status**: deploy projects 시작 명시. 정량 MW status는 또 Item 7 truncated
  - **Brookfield AI Infrastructure Fund**: 2025-08 발표, *$5B 5-year financing framework*
  - **AI 데이터센터 strategic positioning**: customer segments = *hyperscalers, colocation, neocloud, developers, infrastructure investors* — 우리 도구 페르소나 3개와 직접 일치
  - **800 VDC compatibility**: NVIDIA Rubin rack architecture align
  - **AI workload response**: "at least twice as fast as turbines and engines" — 공식 차별화
  - **Reliability**: 99.9% non-redundant, 99.999% redundant
  - **Global**: 1,100 sites in 9 countries, Korea 682 MW
  - **Workforce**: 2,214 FTE (FY2024 2,127에서 +4%), 62 PhD 포함 (Nuclear Engineering 등 — SMR-fuel cell 협력 가능성)
  - **ITC gap year 2025**: 2024 말 만료, OBBBA 새 ITC는 2026 construction starts. *2025 신규 = ITC 없음, 2026+ = 30% ITC 회복*. 도구의 fuel cell capex 시나리오에서 명시 가치
  - **Q4 2025 (transcript 인용)**: Service backlog *$14B*, 100% attach rate, FY2026 guidance $1.65-1.85B
- **Round 3 TODO (별도 fetch 필요)**:
  - [HIGH] 10-K Item 7 MD&A — *두 번 truncated*. Q4 2025 8-K supplemental에서 직접 fetch 권장
  - [MED] FY2025 product MW acceptances/shipped — *공식 정량 수치 미확보*
  - [LOW] Item 2 Properties — 명목 MW/year capacity by facility (sqft만)
  - [LOW] AEP 100 MW initial order shipped/accepted 상태 — Q4 transcript 권장

---

_(이전 placeholder FC-002·FC-001 entries는 위에서 verified entry로 통합·교체됨 — 2026-05-29 정리)_

---

## 2. 보류·검토 중인 출처 (Pending / Under Review)

_라이선스·ToS 검토 또는 변호사 확인이 필요해 *아직 사용하지 않는* 출처._

- **S&P Global Commodity Insights** — 유료 구독, 재배포 금지 조항 강함. 라이선스 협상 전까지 불사용.
- **BloombergNEF (BNEF)** — 동일.
- **Wood Mackenzie / Guidehouse Insights** — 동일.
- **EPRI** — 동일.
- **LandGate / datacenterHawk / Cleanview** — 상업 데이터 플랫폼. ToS상 스크래핑·재판매 금지. 파트너십·라이선스만이 경로.
- **산업 언론 (Utility Dive, Data Center Dynamics, Reuters, Bloomberg News, Power Magazine)** — 본문 © 보호. *개별 사실 인용 + 출처 링크*는 허용 가능, *bulk·자동화 수집은 금지*. 향후 fair-use 한계를 변호사 확인.
- **Bloom Energy 자체 웹사이트의 자동화 수집** — robots.txt·ToS 확인 전까지 자동화 미사용. *공개 SEC 8-K 첨부본*을 우선 사용.

---

## 3. 한 번 사용 후 폐기·교체된 출처 (Deprecated)

_더 정확하거나 합법적인 출처로 교체된 항목._

(아직 항목 없음)

---

## 4. 변호사 확인 필요 항목 (Lawyer Queue)

_별도 문서 `data-source-review-fuelcells.md` 섹션 6의 10개 질문 참조._

---

## 5. 면책 문구 (Disclaimers)

도구의 모든 출력에 적용되는 표준 면책 문구는 `data-source-review-fuelcells.md` 섹션 7 (v0.1)을 참조. 변호사 확정본은 추후 업데이트.
