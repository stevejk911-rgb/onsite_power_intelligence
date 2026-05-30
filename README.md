# On-Site Power Intelligence

> AI 데이터센터 *behind-the-meter (BTM)* 전력 의사결정 도구. 좌표 하나로 사이트별 발전원 시나리오·시간·비용·land를 비교 → 위원회·IC 메모·CEO 슬라이드용 PDF.

**버전**: v1 · 2026-05-29

---

## 30초 요약

미국 데이터센터의 전기 확보 시간이 *그리드 인터커넥션 대기열 6-15년*으로 늘어났다. 이 도구는:

1. **좌표 하나로 사이트 분석** — 지역별 hot zone 매핑 (10곳 verified) → grid 대기·gas 거리·capex multiplier 자동
2. **4 단일 발전원 + 3 하이브리드 + 3 nuclear PPA 비교** — 같은 yardstick으로 시간·capex·land·CO₂·score
3. **결과 PDF** — Print 한 번으로 위원회·IC·CEO 슬라이드 첨부용

핵심 차별화 — **18+ verified 데이터 source · 5 deployment cases · 정직성 4번 정정 명시**. 가정값 옆 (i) 배지 hover 시 SEC EDGAR·NREL PDF·GridLab 보고서 *직접 URL 링크*.

---

## 빠른 시작 (90초)

**필수**: Node.js 18+ ([설치](https://nodejs.org))

```bash
git clone <repo-url>
cd onsite-power-app
node server.js
```

브라우저: **http://localhost:8080**

처음 화면이 Ashburn VA로 자동 설정됨. 좌표 박스에 임의 미국 좌표 입력 → "Go" → 결과 카드 4개 + 하이브리드 3개 + Nuclear PPA 표가 표시.

**선택**: NREL solar API key 발급 (30초, 무료) — `.env.example` 복사해 `.env`로 생성, `NREL_API_KEY=xxx` 입력. 없으면 NREL DEMO_KEY 사용 (rate-limited).

---

## 페르소나별 시작 가이드

### 데이터센터 부지선정 책임자 (개발사)

**사용 시나리오**: 5분 안에 *parcel screen* — EPC 부르기 전 *전력 스토리가 말이 되는지* 확인.

1. Compare view (+ New site로 부지 6-10개 추가)
2. 각 부지 좌표 → hot zone 자동 매핑 → 결과 다양화 확인
3. *부지별 #1 추천 + capex + time*을 표로 비교
4. **📄 PDF로 저장** → 위원회 deck 첨부

권장 priority: **"Speed first"**.

### 하이퍼스케일러 인프라 전략가

**사용 시나리오**: 이사회·CEO 슬라이드용 *부지별 시나리오 비교*. 특히 *하이브리드 mix*가 핵심.

1. 후보 부지 좌표 입력
2. **하이브리드 시나리오 섹션** 확인 — FC+Solar 80/20, Gas mix 60/40, Carbon-free 60/40
3. 부지별 *추천 mix가 다르게 나옴* (Phoenix는 Carbon-free, DFW는 Gas mix 같이)
4. (i) 배지 hover → *Microsoft 40 GW PPA · Meta Socrates 4 OEM mix 같은 ref case URL 직접 클릭*
5. PDF로 CEO·이사회 슬라이드 인용

권장 priority: **"Low carbon"** + IT load 200-1,000 MW.

### 인프라 PE 투자자

**사용 시나리오**: Sponsor의 BTM 가설 IC 메모 backup. 30분 안에 *first-look memo* 재료 확보.

1. Sponsor가 가져온 부지 좌표 입력
2. **결과 카드 4개 + Hybrid 3개 + Nuclear PPA 3 deals** 한 화면에
3. Sponsor의 BTM-only 가정에 대해 *대안 시나리오* (hybrid·nuclear PPA) 확인
4. **Next Steps 체크리스트** → IC 메모 "Diligence checklist" 슬라이드에 그대로
5. PDF → IC 메모 backup

권장 priority: 사용자 deal 성격에 따라.

---

## 데이터 자산 (이 도구의 차별화)

### 4 발전원 + 1 regional overlay = 18+ verified sources

**연료전지 (3)**:
- Bloom Energy FY2024 + FY2025 10-K Item 1 직접 추출 + Q3 2025 supplemental
- 미국 fleet (EIA-860 2016·2024 권위) — 363.8 MW · 186 generators
- Fuel cell capex 한계 명시 — *EIA Bloom 독점으로 공시 억제* 구조적 발견

**가스터빈 (8)**:
- NREL ATB 2024 Fossil · EIA Construction Cost 2023 · GE Vernova FY2024 · Solar Turbines · Wartsila · GridLab/EFG/Halcyon 2025-09 IRP filings · EIA-860 GT fleet 158.6 GW · EIA-860 IC fleet 7.9 GW
- **결정적 발견**: NREL ATB·EIA AEO이 가스 CC capex *26-52% 과소평가* (GridLab 실측)

**Solar + BESS (4)**:
- NREL ATB 2024 Utility-Scale PV · Cole & Karmakar 2023 (outdated) · Augustine & Blair 2021 SFS (10hr cap 발견) · **Cole·Ramasamy·Turan 2025 update** (결정적 30% 하향)

**Hot zone overlay (10)**:
- NoVA · Columbus OH · Silicon Valley · DFW · Phoenix · Atlanta · Reno-Tahoe · Hillsboro OR · Chicago · Quincy WA
- 미국 데이터센터 capacity *80%+ coverage*

**Deployment cases (5)**:
- Meta Socrates South 200 MW BTM · Crusoe Abilene Stargate 1.2-2.1 GW · Microsoft TMI/CCEC 835 MW · Vistra Comanche 1,200 MW · Talen-AWS 1,920 MW (BTM failed → FTM)

### 5가지 구조적 데이터 발견

1. EIA가 fuel cell capex *공시 억제* (Bloom 독점)
2. NREL ATB가 *aero GT 추적 안 함* (utility-scale focus)
3. NREL ATB·EIA AEO이 가스 CC *26-52% 과소평가*
4. NREL BESS modeling *10hr cap*
5. NREL Cole 2023 → 2025 update *30% 하향*

### 정직성 4번 정정

- Talen-AWS deployment case (unverified → WebSearch 후 verified)
- BESS storageHrs 12 → 6 (NREL modeled 10hr cap 밖)
- BESS $350/kWh → Energy + Power split 공식 (NREL 2025 update)
- Fuel cell lead 12 → 18mo (Bloom 10-K Item 1A 정상 baseline)

전체 추적: `data/provenance.md` + `data-sources.html` dashboard 페이지

---

## EIA-860 데이터 추출 (선택)

미국 fuel cell + 가스 fleet *권위 데이터*를 본인 컴퓨터에서 직접 추출:

```bash
npm install xlsx adm-zip   # 최초 1회만
node scripts/fetch-eia860-fuelcells.js     # → data/fuelcells/eia860-2024-fuelcells.json
node scripts/fetch-eia860-gas-turbines.js  # → data/gasturbines/*.json
```

각 30초-1분. EIA 정부 ZIP 자동 다운로드 + Prime Mover 필터 + 사이즈 분포 분석.

상세: `scripts/README.md`

---

## 보안 + Privacy

- ✅ **API key 서버측만** — NREL_KEY는 환경변수, 브라우저 노출 안 됨
- ✅ **Path traversal 방어** — `PUBLIC` boundary 강제
- ✅ **No user data collection** — 사이트 정보는 *브라우저 localStorage*에만 저장. 서버 안 보냄.
- ✅ **No analytics·tracking** — Google Analytics·Plausible 등 *없음*
- ✅ **`.gitignore`** — `.env`·`node_modules`·`.cache` 제외
- ⚠️ **CORS `*` 허용** — localhost 사용 OK. Production 배포 시 *origin 제한 권장*

**Production 배포 시 권장 변경**:
```js
// server.js line 139
res.setHeader("Access-Control-Allow-Origin", "https://your-domain.com");
```

---

## Hosting 옵션

### Self-hosting (권장)

- VPS (DigitalOcean, Linode, Hetzner) $5-20/mo
- 자체 데이터센터 또는 office network
- *데이터 주권 + 보안* 최강

### PaaS (간편)

- **Vercel** — Node 18+ 지원. `vercel.json` 추가 필요
- **Railway** — git push 자동 배포
- **Render** — free tier 가능 (cold start)
- **Heroku** — 유료 (free tier 2022 종료)

### Static + 별도 backend

- `public/` 폴더 Netlify·Cloudflare Pages에 (지명·좌표 동기화 외 모든 기능 작동)
- `server.js`만 별도 VPS (NREL solar API용)

---

## 시스템 요구사항

- **Node.js 18+** (built-in `fetch` 사용)
- 디스크 약 *45 MB* (node_modules 15 MB + .cache EIA-860 ZIP 30 MB)
- **인터넷 접속** — Nominatim·Overpass·NREL API (모두 무료·공공)
- 메모리 *50 MB 안팎* (in-memory cache)

---

## 라이선스 + 데이터 출처

- **현재 v1 — 모든 기능 무료, 사용 제한 없음.** 시장 검증 단계. 향후 가격 정책 적용 가능성 있으나 *현 사용자에게 사후 부과는 없음*.
- **코드**: 자유 사용 (개인·기업·non-profit). 단 production 사용 전 보안 점검.
- **데이터 출처**: 분류 + 재배포 risk 등급은 `../data-source-review-fuelcells.md` 참조
  - 🟢 정부공공 9개 (EIA·NREL·SEC EDGAR·state PSC) — 재배포 OK
  - 🟡 회색지대 8개 (산업 언론·기업 발표) — 사실 인용 OK, 본문 전재 금지
  - 🔴 보류 5개 (S&P Global·BNEF·Wood Mac·EPRI·LandGate) — 라이선스 없이 사용 안 함

---

## 도구 검증

전체 15 섹션 테스트: `TESTING_CHECKLIST.md`

페르소나 검증 보고: `../service-validation-iter1.md` · `../service-validation-iter2.md` · `../service-validation-iter3.md`

**iter3 결과**: 3 페르소나 모두 *베타/완성 수준 도달*. v1 출시 준비 완료.

---

## 피드백·문의

본 도구는 *진짜 사용자의 결정에 영향을 주는지* 검증 단계.

- **데이터센터 부지선정 책임자** — Compare view + PDF가 위원회 워크플로우에 맞나?
- **하이퍼스케일러 인프라 전략가** — 하이브리드 시나리오가 실제 mix 결정에 도움 되나?
- **PE 인프라 투자자** — Nuclear PPA 5번째 시나리오 + 정직성 4번 정정이 IC 메모 backup으로 작동하나?

문의·피드백: [이메일 또는 issue tracker]

---

*Built with rigor and honesty. Verified against authoritative sources. Designed for decisions that matter.*
