# 도구 테스트 체크리스트 (몰아서 검증용)

*2026-05-29 정리. 최근 변경 사항이 의도대로 동작하는지 한 번에 검증.*

**시작 명령:**
```bash
cd /Users/sukju/Documents/Claude/Projects/ONSITE_POWER_INTELLIGENCE/onsite-power-app
node server.js
```
브라우저: `http://localhost:8080`

---

## 우선순위 그룹 (12 섹션을 4 그룹으로 묶음)

**[A. 정확성 critical — 가장 먼저]** *(약 15분)*
- §4 ASSUMPTION_PROVENANCE tooltip + URL 링크
- §6 BESS storageHrs 6 + split 공식 정정 (가장 최근 결정적 정정)
- §3 hardNo 시각화 (Silicon Valley + Quincy WA 빗금·빨간 배지)

**[B. Hot zone 신규 매핑]** *(약 10분)*
- §2 Round 2 5개 hot zone (Atlanta, Reno-Tahoe, Hillsboro OR, Chicago, Quincy WA)
- §7 Fleet context β+δ 혼합 (#1만 full, 나머지 mini)
- §8 Nuclear caveat 조건부 (carbon priority + 300+ MW일 때만)

**[C. UX·동기화]** *(약 10분)*
- §1 좌표·지명 박스 자동 동기화 + 충돌 시 좌표 우선
- §5 신뢰도 색상 구분
- §10 Compare view 경고 배너
- §11 Footprint 패널 접기·펴기

**[D. 신규 페이지 + 통합 확인]** *(약 10분)*
- §9 Method 섹션 fleet 4 bullet
- §12 데이터 자산 dashboard 페이지

**총 예상 시간: 45분.** 한 번에 다 안 해도 됨 — 그룹별로 나눠서 가능. 각 그룹 끝나면 발견 보고.

---

## 1. 좌표·지명 박스 자동 동기화

**1-1. 지명 입력 → 좌표 자동 채움**
- [ ] 좌표 박스 클리어 → 지명 박스에 "Atlanta GA" 입력 → Find 클릭
- [ ] **확인**: 좌표 박스에 `33.49xx, -84.75xx` 같은 좌표가 자동으로 채워짐
- [ ] 지명 박스도 reverse 결과(예: "Fulton County, Georgia")로 자동 갱신

**1-2. 좌표 입력 → 지명 자동 채움**
- [ ] 지명 박스 클리어 → 좌표 박스에 `47.23, -119.85` (Quincy WA) 입력 → Go 클릭
- [ ] **확인**: 지명 박스에 "Grant County, Washington" 자동 채워짐

**1-3. 충돌 — 좌표 우선**
- [ ] 지명 박스에 "San Jose" + 좌표 박스에 `47.23, -119.85` 둘 다 입력 → Find 클릭
- [ ] **확인**: 상태바에 "지명·좌표 둘 다 입력 — 좌표 우선 적용" 안내. Quincy WA로 이동 (San Jose 아님).

**1-4. 맵 클릭 동기화**
- [ ] 맵의 임의 지점 클릭
- [ ] **확인**: 좌표·지명 박스 둘 다 클릭 위치로 자동 갱신

---

## 2. Hot zone Round 2 — 5개 새 hot zone

각 좌표 입력 후 *Regional context 보라색 패널*이 표시되는지 + 정확한 hot zone short name이 나오는지 확인.

- [ ] **Atlanta**: `33.49, -84.75` → "Atlanta hot zone" 보라색 패널
- [ ] **Reno-Tahoe**: `39.55, -119.40` → "Reno-Tahoe hot zone"
- [ ] **Hillsboro OR**: `45.52, -122.99` → "Hillsboro OR hot zone"
- [ ] **Chicago**: `41.85, -87.65` → "Chicago hot zone"
- [ ] **Quincy WA**: `47.23, -119.85` → "Quincy WA hot zone"

각 hot zone에서 capex multiplier가 정상 적용되는지:
- [ ] Atlanta `capex ×0.95` 결과 카드에 표기
- [ ] Reno-Tahoe `capex ×1.0`
- [ ] Hillsboro OR `capex ×1.10`
- [ ] Chicago `capex ×1.05`
- [ ] Quincy WA `capex ×0.85`

---

## 3. hardNo 시나리오 시각화 강화

**3-1. Silicon Valley**
- [ ] `37.36, -121.95` → Silicon Valley hot zone 매칭
- [ ] **확인**: Gas Turbine + Reciprocating 카드가:
  - 카드 자체 *반투명 + 빗금 효과*
  - 상단에 *빨간 "이 hot zone에서 사용 비추천" 배지*
  - 카드 안에 *빨간 flag "Silicon Valley에서 사실상 비추천 (환경 규제·시장 구조)"*
  - Ranking에서 *마지막 둘로 밀려남* (#3·#4)
  - RECOMMENDED 배지 안 뜸 (#1이라도)

**3-2. Quincy WA**
- [ ] `47.23, -119.85` → 동일 동작 확인 (Quincy WA techHardNo도 ["turbine","recip"])

---

## 4. ASSUMPTION_PROVENANCE custom tooltip + URL 링크

**4-1. Desktop hover**
- [ ] 임의 사이트에서 결과 카드의 **Est. capex** 옆 (i) 배지에 마우스 hover
- [ ] **확인**: popup이 부드럽게 나타남 — 신뢰도 점·label·범위·출처 텍스트·"출처 열기 ↗" hyperlink 표시

**4-2. Click toggle**
- [ ] (i) 배지 클릭 → popup 열림 → 다시 클릭 → 닫힘
- [ ] 다른 (i) 클릭 → 이전 popup 닫히고 새 popup 열림
- [ ] popup 바깥 click → 닫힘

**4-3. 출처 URL hyperlink**
- [ ] popup의 "출처 열기 ↗" 클릭 → 새 탭에서 PDF/8-K 직접 열림 (예: GridLab PDF, NREL ATB, Bloom 10-K)

**4-4. Keyboard 접근 (a11y)**
- [ ] Tab 키로 (i) 배지에 focus 이동 — 주황 외곽선 보임
- [ ] Enter/Space로 toggle
- [ ] Escape로 닫힘

**4-5. Mobile** (DevTools F12 → 좁은 화면)
- [ ] (i) tap → popup 표시 (hover 없이)
- [ ] popup이 화면 밖으로 잘리지 않음

---

## 5. 신뢰도별 색상 구분

각 (i) 배지의 색상 확인:
- 🟢 녹색 = high: turbine·recip·solar capex, recip·fuelcell lead, bessCost, storageHrs
- 🟡 노란색 = medium: fuelcell capex, turbine lead

---

## 6. BESS storageHrs 12 → 6 변경 + split 공식 정정

- [ ] Solar PV + Battery 시나리오의 Solar 카드 *notes 영역* 확인:
  - 자동 표시되어야 함: "⚠ Solar+BESS는 *24/7 firm을 약속 못함* — 1-2일 연속 흐림 ride-through 불가. 실제 hyperscaler는 *off-site PPA*..."
- [ ] Assumptions 패널에서 Storage duration 값이 *6 hours*인지 확인
- [ ] **storageHrs를 11+로 변경**해서 추가 caveat 자동 표시 확인:
  - "⚠ BESS Xhr는 NREL modeled domain 밖 (Augustine & Blair 2021 SFS: BESS modeling capped at 10hr). 10hr 이상은 *extrapolation* — 정확도 떨어짐."

### 6-α. BESS split 공식 (2026-05-29 정정)
- [ ] Assumptions 패널에 *2개 새 field*:
  - "BESS energy cost" — default $241/kWh
  - "BESS power cost" — default $372/kW
- [ ] (이전 "Battery cost $/kWh installed" 1개 field는 제거됨)
- [ ] Solar 카드의 BESS capex가 *이전보다 약 13% 낮음* (6hr 기준: $2,100/kW → $1,818/kW)
- [ ] energy cost (i) 배지 hover → "Cole·Ramasamy·Turan 2025 update (NREL/TP-6A40-93281)" + 30% 하향 caveat
- [ ] storageHrs를 변경(예: 4 → 8)하면 BESS capex가 *공식대로 자동 갱신* — 모든 duration에서 정확

### 6-β. 정직성 명시 (provenance.md SOLAR-004 entry)
- 우리 도구가 *2026-05-29 12:00 PM 이전*에 Solar+BESS를 *15% 과대평가*했음. 정정 후 NREL 2025 baseline align.

---

## 7. Fleet context (β+δ 혼합)

- [ ] 임의 사이트 결과 → 카드 4개 fleet 박스 확인:
  - **#1 추천 카드**: full *시장 컨텍스트* 박스 (5줄: 미국 fleet, BTM 적합, 2024 BOL, 최대 운영자, growth signal)
  - **#2~#4 카드**: 한 줄 미니만 ("시장: X MW · BTM 적합 Y MW")
- [ ] hardNo 시나리오(Silicon Valley·Quincy WA)에서 #1이 hardNo가 아니어야 full box 표시

---

## 8. Nuclear PPA caveat (조건부)

**8-1. 일반 시나리오 — caveat 안 보임**
- [ ] Ashburn VA preset · IT load 120 MW · priority "Speed first"
- [ ] **확인**: verdict 영역에 nuclear caveat *안 보임*

**8-2. Carbon priority + 큰 부하 — caveat 표시**
- [ ] IT load 500 MW · priority "**Low carbon**"
- [ ] **확인**: verdict 영역에 노란 caveat 박스 표시:
  - "💡 비교 옵션 — off-site nuclear PPA..."
  - "Microsoft TMI/CCEC 835 MW · Vistra Comanche 1,200 MW · Talen-AWS 1,920 MW..."

**8-3. Carbon priority + 작은 부하 — caveat 안 보임**
- [ ] IT load 200 MW (< 300) · priority "Low carbon"
- [ ] **확인**: nuclear caveat *안 보임* (GW급만 trigger)

---

## 9. Method 섹션 데이터 출처 패널

Method 영역 펼치고 *Data provenance* 패널 확인 — 6개 bullet 모두 표시:
- [ ] 가스터빈 capex $1,500/kW · GridLab PDF 링크
- [ ] 가스 recip capex $1,354/kW · EIA Construction link
- [ ] Fuel cell capex $3,800/kW · Bloom 10-K 링크
- [ ] Lead time — Bloom·Wartsila·GridLab 인용
- [ ] **GT fleet 158.6 GW · Aero 21.5 GW BTM sweet spot**
- [ ] **IC fleet 7.9 GW · Wartsila-class 2 GW · 2024 BOL 2.7x signal**
- [ ] **데이터센터 BTM = 새 시장 (US fleet 2% = 24 GW)**
- [ ] **Nuclear PPA 비교 옵션** (MS-TMI·Vistra·Talen 3 deals + BTM nuclear dead)

---

## 10. Compare view 경고 배너

- [ ] + New site로 사이트 4개 추가 (모두 default 값)
- [ ] Compare view 열기
- [ ] **확인**: 모든 사이트 결과 동일하면 노란 경고 배너 + 3가지 해결법
- [ ] Region 컬럼에 hot zone short name inline 표기 (예: "PJM / NoVA")

---

## 11. Footprint 패널 접기·펴기

- [ ] Land footprint 패널이 *closed* 상태로 시작 (▶ 화살표)
- [ ] 클릭하면 펼쳐짐

---

## 15. Nuclear PPA 5번째 시나리오 (David 갭)

### 15-1. 섹션 표시 — 항상 (priority·부하 무관)
- [ ] 하이브리드 섹션 *아래에* 노란 박스 "⚛️ Off-site Nuclear PPA — 본 도구 BTM 범위 밖, 비교용"
- [ ] 설명문 + 3-row 표 + footer 권장 의사결정 함의

### 15-2. 3 deals 표 내용
- [ ] MS-TMI 835 MW · 20yr · grid FTM · PJM/PA · 2028 · "Retired plant resurrection"
- [ ] Vistra-CP 1,200 MW · 20yr+20opt · grid FTM · ERCOT/TX · 2027→2032 · "Existing plant reallocation"
- [ ] Talen-AWS 1,920 MW · 17yr · $18B · grid FTM · PJM/PA · 2027 · "BTM 시도→FERC 거부→FTM 전환"

### 15-3. Deal 이름 클릭 → SEC EDGAR 새 탭
- [ ] MS-TMI 클릭 → Constellation 8-K SEC 페이지
- [ ] Vistra-CP 클릭 → Vistra 8-K
- [ ] Talen-AWS 클릭 → Talen 2025-06 8-K

### 15-4. 사용자 부하 fit 자동 계산
- IT load **120 MW** → 모든 PPA에서 *14-7% fit ("너무 큼")* 회색 표시
- IT load **500 MW** → MS-TMI 60% (적합 녹색), Vistra 42% (작음), Talen 26% (너무 큼)
- IT load **900 MW** → MS-TMI 108% (tight 주황), Vistra 75% (적합), Talen 47% (작음)
  - **권장 박스 자동 표시**: "💡 당신의 900 MW 부하는 GW급 nuclear PPA 후보..."
- IT load **2,000 MW** → MS-TMI·Vistra 모두 *over (다중 PPA)*. Talen 104% tight.

### 15-5. 의사결정 함의 footer
- [ ] "*BTM nuclear는 FERC 2024-11 Talen 거부 후 사실상 막힘*" 명시
- [ ] "Carbon-free 24/7 + GW급 부하라면 *BTM 4 시나리오 + off-site nuclear PPA* 둘 다 검토"

---

## 14. 하이브리드 시나리오 (Phase 1 MVP)

### 14-1. 단일 4 카드 정상 표시
- [ ] 메인 cards 영역에 *4 단일 카드*만 표시 (Gas Turbine·Reciprocating·Fuel Cell·Solar)
- [ ] 각 카드 #rank가 *전체 7 중*에서 위치 — 즉 #1·#2·#3·#4·#5·#6·#7 중에서 단일이 차지하는 rank

### 14-2. 하이브리드 섹션 표시
- [ ] 단일 카드 아래 *별도 회색 박스* "하이브리드 시나리오 — verified deployment cases 기반"
- [ ] 3개 hybrid 카드 grid:
  - **FC + Solar 80/20** (Bloom AEP 패턴) — 진한 보라
  - **Gas mix 60/40** (Meta Socrates 패턴) — 진한 빨강
  - **Carbon-free 60/40** (Microsoft 패턴) — 진한 녹색
- [ ] 각 hybrid 카드:
  - 발전원 비율 *시각 bar* (mixbar) — 색상 segments
  - Mix label (예: "Fuel Cells · Solar+BESS")
  - rank (#1~#7 중)
  - time/capex/land/CO₂/score — 단일과 같은 형식
  - 구성 + ref_case note (예: "구성: Fuel Cells 80% + Solar+BESS 20%. 참고: Bloom Energy + AEP 1 GW (2024-11)")

### 14-3. 같은 yardstick 정규화
- [ ] 단일 + hybrid 모두 score 0-100 범위
- [ ] Side-by-side comparison 표에 *7행 모두* 표시
- [ ] Verdict 영역 #1이 단일일 수도 hybrid일 수도 — *부지·priority에 따라 다름*

### 14-4. 부지별 hybrid 우위 차이
- **Quincy WA hot zone** (`47.23, -119.85`) 입력:
  - Gas turbine·Recip 단독 → hardNo 빗금
  - **Gas mix hybrid도 hardNo** (mix 안의 turbine·recip 둘 다 hardNo) → 빗금
  - FC+Solar, Carbon-free hybrid는 OK
- **Phoenix hot zone** (`33.5, -112.0`):
  - **Carbon-free hybrid가 #1 RECOMMENDED** 가능성 (solar 매력 + carbon 우위)
- **DFW hot zone** (`32.78, -96.80`):
  - **Gas mix hybrid가 강세** (가스 풍부 + capex 저렴)

### 14-5. Compare view 통합
- [ ] Compare view 표에 *각 사이트의 #1 추천*만 표시 (단일이든 hybrid이든)
- [ ] Recommended 컬럼에 hybrid면 mix 이름 (예: "FC + Solar 80/20")

---

## 13. PDF export — Print 버튼

### 13-1. 단일 사이트 print
- [ ] Workbench에서 verdict 박스 *아래에* "📄 PDF로 저장 / 인쇄" *주황 버튼* 표시 (옆에 "위원회 deck · IC 메모 · CEO 슬라이드에 첨부용" 안내 문구)
- [ ] 버튼 클릭 → 브라우저 인쇄 대화상자 열림
- [ ] 인쇄 미리보기 확인:
  - 상단에 *Print 전용 헤더* 표시: "On-Site Power Intelligence — 단일 사이트 분석" + 사이트 이름·좌표·region·hot zone·IT load·priority·생성 날짜
  - 사용자 조작 UI는 *모두 숨김* (메뉴, sitebar, 입력 박스, 좌표 입력, preset 버튼, map, assumptions/method 펼침 버튼)
  - Regional context 패널·Verdict 박스(검은 배경 유지)·Next steps 체크리스트·결과 카드 4개·비교 표 모두 *깔끔하게* 보임
  - 카드 4개가 *2×2 grid*로 페이지에 압축
  - hardNo 카드 (있다면)의 빗금·빨간 배지 유지
  - (i) provBadge는 *숨김* (인쇄에서 hover 안 됨)
  - 하단에 *Print 전용 푸터* 표시: "데이터 출처 + 신뢰도 · 전체 데이터 자산 dashboard URL · 정직성 정정 이력 4번 · ±40% 정확도 caveat"
- [ ] "PDF로 저장" 선택 → 깔끔한 PDF 파일 저장

### 13-2. Compare view print
- [ ] Compare view 헤더 안에 "📄 PDF로 저장" 버튼 표시
- [ ] 클릭 → 인쇄 미리보기:
  - 상단 헤더: "On-Site Power Intelligence — N 사이트 비교" + 생성 날짜
  - 비교 표만 깔끔하게 (다른 UI 모두 숨김)
  - Region 컬럼에 hot zone short name 유지
  - 하단 푸터 동일

### 13-3. Page break 처리
- [ ] 결과 카드가 페이지 경계에서 잘리지 않음
- [ ] Verdict 박스가 한 페이지에 (필요시 한 페이지 차지)
- [ ] Next steps 체크리스트가 한 페이지에

---

## 12. 데이터 자산 dashboard (data-sources.html)

**12-1. 메인 도구에서 진입**
- [ ] Method 섹션 펼침 → 하단에 *주황 강조 박스*: "📊 데이터 자산 dashboard 보기 →"
- [ ] 클릭하면 `data-sources.html` 새 페이지로 이동 (또는 같은 탭)

**12-2. Dashboard 페이지 구조**
- [ ] **Hero**: 검은 박스 + 5개 통계 (18+ sources, 5 cases, 10 hot zones, 2 scripts, 5 findings)
- [ ] **5가지 구조적 발견** 노란 박스 (EIA 공시 억제, ATB aero 미추적, ATB 26-52% 과소평가, BESS 10hr cap, BESS 30% 하향)
- [ ] **6 섹션 별도 카드**: 연료전지 · 가스터빈 · Solar+BESS · Hot zones · Deployment cases · Scripts
- [ ] **Redistribution 등급**: 🟢/🟡/🔴 분류 (9/8/5개)
- [ ] Footer: "도구로 돌아가기" 링크

**12-3. 각 source 표에서 클릭 가능 확인**
- [ ] GT-006 옆 "PDF" 링크 → GridLab PDF 새 탭
- [ ] SOLAR-004 옆 "PDF" → NREL 2025 update PDF
- [ ] DEPLOY 카드 카드 형식 (5개 grid)

**12-4. 깔끔함 (인지 부하 X)**
- [ ] 페이지가 *압도적이지 않음* — 사용자가 한 번에 스캔 가능
- [ ] 표가 *너무 작지 않음*. 모바일에서도 가독성 OK

---

## 발견 보고 양식

각 항목 옆 [ ] 체크. NG 발견 시 무엇이 어떻게 안 됐는지 + 가능하면 스크린샷.

```
1-1. OK / NG (NG: ...)
1-2. OK / NG
...
```
