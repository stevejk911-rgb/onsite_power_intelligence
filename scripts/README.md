# scripts/ — 데이터 수집 스크립트

각 스크립트는 사용자 컴퓨터에서 직접 실행해 권위 있는 정부·기업 공시 데이터를 가져와 `data/` 디렉토리에 저장한다.

---

## fetch-eia860-fuelcells.js

**목적**: EIA Form 860 (Annual Electric Generator Report) 2024년 reporting year 데이터를 다운로드해 Prime Mover = "FC" (Fuel Cell)인 발전기만 추출, 미국 현재 fuel cell fleet의 권위 있는 총량·주별·OEM별 분포를 JSON으로 저장.

**왜 스크립트인가**: EIA-860 ZIP은 ~30 MB이고 안에 다수 XLSX 시트(Generator, Plant, Owner 등)가 포함되어 있어 직접 Read 도구로 처리 불가. Node 스크립트가 다운로드→압축해제→XLSX 파싱→필터링→집계까지 한 번에 수행.

**실행**:
```bash
cd /Users/sukju/Documents/Claude/Projects/ONSITE_POWER_INTELLIGENCE/onsite-power-app
npm install xlsx adm-zip   # 최초 1회만
node scripts/fetch-eia860-fuelcells.js
```

**출력**:
- `data/fuelcells/eia860-2024-fuelcells.json` — 발전기 단위 데이터 + 합계
- 콘솔에 요약: 총 MW, 주별 상위 10, operator 상위 10, 가동 연도별

**예상 결과** (FC-002 추정):
- 2016 baseline 137 MW → 2024 현재 *300-700 MW* 범위로 추정. 스크립트 실행 후 권위 있는 단일 수치 확정.
- 주별 분포: CA / CT / DE 3개 주가 여전히 다수 차지할 것 (2016년 85%).
- Operator 상위: Bloom 고객들(Equinix, AT&T 등)이 직접 operator로 등록된 경우와, 전력회사(Bloom EaaS PPA 경유)로 등록된 경우 혼재.

**라이선스**: EIA 데이터는 미국 정부 공공 도메인 (🟢) — 자유롭게 재배포 가능.

**실패 시**:
- HTTP 404 → EIA URL 변경. `https://www.eia.gov/electricity/data/eia860/` 방문해 최신 ZIP 링크 확인 후 스크립트 상단 `EIA860_ZIP_URL` 수정.
- `xlsx/adm-zip 미설치` → `npm install xlsx adm-zip` 다시 실행.
- 시트 구조가 달라 열 매핑 실패 → 콘솔에 출력되는 `[열 매핑]` 섹션과 실제 XLSX 헤더를 대조해 `findCol` 패턴 보완.

---

## fetch-eia860-gas-turbines.js

**목적**: EIA Form 860 2024를 fork 처리해 *가스터빈(GT) + reciprocating engine(IC)* 두 카테고리 동시 추출. Energy Source 가스 fuel 필터링 (NG, LFG, OBG, OG, PG, AB 포함 — 디젤·석유 제외).

**왜 두 카테고리?**: 우리 도구의 가스 시나리오 두 발전원(`turbine`, `recip`)에 직접 매핑. EIA-860은 prime mover 코드로 명확 구분.

**실행** (FC 스크립트 이후라 ZIP 캐시 재사용됨):
```bash
cd /Users/sukju/Documents/Claude/Projects/ONSITE_POWER_INTELLIGENCE/onsite-power-app
node scripts/fetch-eia860-gas-turbines.js
```

**출력**:
- `data/gasturbines/eia860-2024-gas-turbines.json` — Prime Mover 'GT' (combustion/gas turbine simple cycle)
- `data/gasturbines/eia860-2024-reciprocating.json` — Prime Mover 'IC' (internal combustion engine, gas only)
- 콘솔에 *두 카테고리 각각* 요약: 총 MW, 주별 상위 10, 사이즈 분포 (aero/mid/frame), operator 상위 10, 가동 연도별

**예상 결과**:
- GT (simple cycle gas turbine) 미국 fleet 수십 GW (대부분 utility peaker). 데이터센터 BTM 사용은 일부만.
- IC (gas reciprocating) 미국 fleet 수 GW (Wartsila, Cat, INNIO 등). 데이터센터 BTM 핵심.

**사이즈 분포 의미**:
- GT: aero (<50 MW, LM2500급) vs mid (50-150) vs F-class (150-300) vs H/J-class (300+)
- IC: 작은 모듈 (<5 MW) vs mid (5-15) vs 큰 모듈 (15-25 MW, Wartsila 18V50SG 클래스) vs heavy (25+)

**라이선스**: EIA 데이터 미국 정부 공공 도메인 (🟢).

---

## (계획) fetch-gevernova-10k.js

GE Vernova 10-K에서 Power 세그먼트 매출 분기별 정확 수치 + aero/H-class 출하 분리.

## (계획) fetch-bloom-10k-mda.js

Bloom 10-K Item 7 MD&A 섹션만 별도 fetch — MW shipped/acceptances, $ backlog, MW backlog. 본 fetch는 SEC EDGAR HTML이 124KB로 한 번에 못 받아 잘렸음.
