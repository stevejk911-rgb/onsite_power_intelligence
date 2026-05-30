#!/usr/bin/env node
/*
 * fetch-eia860-gas-turbines.js
 *
 * EIA Form 860 (2024 reporting year, released 2025-09-09) 다운로드 →
 * Prime Mover 'GT' (Combustion/Gas Turbine) + 'IC' (Internal Combustion Engine) 동시 필터링 →
 * Energy Source가 가스 (NG, LFG, OBG, OG, AB)인 generator만 →
 * 미국 가스터빈·reciprocating fleet 권위 데이터 추출.
 *
 * 사용법:
 *   1. cd /Users/sukju/Documents/Claude/Projects/ONSITE_POWER_INTELLIGENCE/onsite-power-app
 *   2. npm install xlsx adm-zip   (FC 스크립트 실행 시 이미 설치되어 있으면 스킵)
 *   3. node scripts/fetch-eia860-gas-turbines.js
 *
 * 출력:
 *   - data/gasturbines/eia860-2024-gas-turbines.json (GT prime mover)
 *   - data/gasturbines/eia860-2024-reciprocating.json (IC prime mover)
 *   - 콘솔에 두 카테고리 요약 (총 MW, 주별, OEM별, 사이즈 분포, 가동 연도별)
 *
 * 데이터 라이선스: EIA-860은 미국 정부 공공 도메인 (🟢)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

let XLSX, AdmZip;
try {
  XLSX = require('xlsx');
  AdmZip = require('adm-zip');
} catch (e) {
  console.error('\n[X] 필수 모듈이 설치되어 있지 않습니다.');
  console.error('   FC 스크립트(fetch-eia860-fuelcells.js)를 먼저 실행했으면 이미 설치되어 있어야 합니다.');
  console.error('   다음 명령으로 설치:\n');
  console.error('   cd ' + path.resolve(__dirname, '..'));
  console.error('   npm install xlsx adm-zip\n');
  process.exit(1);
}

// =========================================================================
// 설정
// =========================================================================

const EIA860_ZIP_URL = 'https://www.eia.gov/electricity/data/eia860/xls/eia8602024.zip';

const OUT_DIR = path.resolve(__dirname, '..', 'data', 'gasturbines');
const CACHE_DIR = path.resolve(__dirname, '..', '.cache');
const ZIP_PATH = path.join(CACHE_DIR, 'eia8602024.zip');

// 추출 카테고리 — 각각 별도 JSON 출력
const CATEGORIES = [
  {
    id: 'gas-turbines',
    primeMover: 'GT',
    label: 'Combustion / Gas Turbine (Simple Cycle)',
    outputJson: path.join(OUT_DIR, 'eia860-2024-gas-turbines.json'),
    sizeBuckets: [
      { label: 'Aeroderivative class (<50 MW)', max: 50 },
      { label: 'Mid-frame (50–150 MW)', max: 150 },
      { label: 'Heavy-duty frame F-class (150–300 MW)', max: 300 },
      { label: 'Heavy-duty frame H/J-class (300+ MW)', max: Infinity }
    ]
  },
  {
    id: 'reciprocating',
    primeMover: 'IC',
    label: 'Internal Combustion Engine (Gas Reciprocating)',
    outputJson: path.join(OUT_DIR, 'eia860-2024-reciprocating.json'),
    sizeBuckets: [
      { label: 'Small modular (<5 MW)', max: 5 },
      { label: 'Mid-size (5–15 MW)', max: 15 },
      { label: 'Large modular (15–25 MW — Wartsila 18V50SG class)', max: 25 },
      { label: 'Heavy (25+ MW)', max: Infinity }
    ]
  }
];

// Energy Source 필터 — 가스 fuel만. 디젤(DFO·RFO) 제외.
// EIA-860 코드:
//   NG = Natural Gas
//   LFG = Landfill Gas
//   OBG = Other Biomass Gas
//   OG = Other Gas
//   AB = Agricultural By-Products (some biogas plants)
//   PG = Propane Gas
const GAS_FUEL_CODES = new Set(['NG', 'LFG', 'OBG', 'OG', 'PG', 'AB']);

// =========================================================================
// 다운로드 (FC 스크립트가 이미 받았으면 캐시 재사용)
// =========================================================================

function downloadIfNeeded(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1024 * 1024) {
      const size = fs.statSync(dest).size;
      console.log('[캐시 재사용] 기존 ZIP (' + (size / 1024 / 1024).toFixed(1) + ' MB) — FC 스크립트가 받아둠');
      return resolve();
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    console.log('[다운로드] ' + url);
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'onsite-power-intelligence/0.1 research-tool' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const newUrl = res.headers.location;
        console.log('  → redirect: ' + newUrl);
        file.close();
        try { fs.unlinkSync(dest); } catch (e) {}
        return downloadIfNeeded(newUrl, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch (e) {}
        return reject(new Error('HTTP ' + res.statusCode + ' — EIA URL 변경 가능성. https://www.eia.gov/electricity/data/eia860/ 에서 확인 후 EIA860_ZIP_URL 갱신.'));
      }
      const ct = (res.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('text/plain')) {
        file.close();
        try { fs.unlinkSync(dest); } catch (e) {}
        return reject(new Error('서버가 ZIP이 아닌 ' + ct + ' 응답함 — URL이 잘못된 폴더로 redirect됐을 가능성.'));
      }
      let received = 0;
      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total) {
          process.stdout.write('\r  진행: ' + (received / 1024 / 1024).toFixed(1) + ' / ' + (total / 1024 / 1024).toFixed(1) + ' MB');
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        process.stdout.write('\n');
        file.close(resolve);
      });
    });
    req.on('error', reject);
  });
}

// =========================================================================
// 파싱 — FC 스크립트와 동일 패턴
// =========================================================================

function extractGeneratorWorkbook(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const generatorEntry = entries.find(e => /3_1_Generator.*\.xlsx$/i.test(e.entryName));
  if (!generatorEntry) {
    console.error('[X] ZIP 안에서 Generator XLSX를 못 찾았습니다.');
    entries.forEach(e => console.error('     - ' + e.entryName));
    throw new Error('Generator xlsx not found in ZIP');
  }
  console.log('[추출] ' + generatorEntry.entryName);
  const buffer = generatorEntry.getData();
  return XLSX.read(buffer, { type: 'buffer' });
}

function findGeneratorSheet(workbook) {
  const operable = workbook.SheetNames.find(n => /operable/i.test(n));
  return operable ? workbook.Sheets[operable] : workbook.Sheets[workbook.SheetNames[0]];
}

function parseRows(sheet) {
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  const headerIdx = allRows.findIndex(row => row.some(cell => typeof cell === 'string' && /prime\s*mover/i.test(cell)));
  if (headerIdx === -1) {
    throw new Error('헤더 행에서 "Prime Mover" 열을 못 찾았습니다.');
  }
  const header = allRows[headerIdx].map(h => (h == null ? '' : String(h).trim()));
  const dataRows = allRows.slice(headerIdx + 1).filter(row => row.length && row.some(c => c !== null && c !== ''));
  return dataRows.map(row => {
    const obj = {};
    header.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function findCol(headers, ...patterns) {
  for (const p of patterns) {
    const found = headers.find(h => new RegExp(p, 'i').test(h));
    if (found) return found;
  }
  return null;
}

// =========================================================================
// 필터링 + 집계
// =========================================================================

function filterAndAggregate(rows, category) {
  const headers = Object.keys(rows[0]);

  const colPrimeMover = findCol(headers, '^prime\\s*mover$', 'prime\\s*mover\\s*code', 'prime\\s*mover');
  const colCapacityMW = findCol(headers, 'nameplate\\s*capacity', 'nameplate.*\\(mw\\)');
  const colState = findCol(headers, '^state$', 'state\\s*name');
  const colOperator = findCol(headers, 'utility\\s*name', 'operator\\s*name', 'plant\\s*operator');
  const colPlant = findCol(headers, '^plant\\s*name$');
  const colOperatingYear = findCol(headers, 'operating\\s*year', 'commercial.*year', 'in.*service.*year');
  const colEnergySource = findCol(headers, 'energy\\s*source\\s*1', 'energy\\s*source(?!.*2)', 'energy\\s*source');
  const colCounty = findCol(headers, '^county$');
  const colStatus = findCol(headers, '^status$', 'operational\\s*status');

  if (!colPrimeMover || !colCapacityMW) {
    throw new Error('필수 열(Prime Mover 또는 Nameplate Capacity)을 찾지 못했습니다.');
  }

  // Step 1: Prime Mover 필터
  const byMover = rows.filter(r => {
    const pm = r[colPrimeMover];
    return pm && String(pm).trim().toUpperCase() === category.primeMover;
  });

  // Step 2: Energy Source 가스 fuel 필터
  let gasFiltered = byMover;
  let nonGasCount = 0;
  if (colEnergySource) {
    gasFiltered = byMover.filter(r => {
      const es = String(r[colEnergySource] || '').trim().toUpperCase();
      if (GAS_FUEL_CODES.has(es)) return true;
      nonGasCount++;
      return false;
    });
  }

  console.log('\n[' + category.id + '] Prime Mover "' + category.primeMover + '" = ' + byMover.length +
              '개 → 가스 fuel 필터 후 ' + gasFiltered.length + '개 (제외 ' + nonGasCount + '개 — 디젤·기타)');

  const generators = gasFiltered.map(r => ({
    plantName: r[colPlant],
    state: r[colState],
    county: colCounty ? r[colCounty] : null,
    operator: colOperator ? r[colOperator] : null,
    nameplateMW: typeof r[colCapacityMW] === 'number' ? r[colCapacityMW] : parseFloat(r[colCapacityMW]) || 0,
    operatingYear: colOperatingYear ? r[colOperatingYear] : null,
    energySource: colEnergySource ? r[colEnergySource] : null,
    status: colStatus ? r[colStatus] : null
  }));

  const totalMW = generators.reduce((s, g) => s + (g.nameplateMW || 0), 0);
  const byState = {};
  const byYear = {};
  const byOperator = {};
  const bySize = {};
  category.sizeBuckets.forEach(b => { bySize[b.label] = { count: 0, MW: 0 }; });

  for (const g of generators) {
    if (g.state) byState[g.state] = (byState[g.state] || 0) + g.nameplateMW;
    if (g.operatingYear) byYear[g.operatingYear] = (byYear[g.operatingYear] || 0) + g.nameplateMW;
    if (g.operator) byOperator[g.operator] = (byOperator[g.operator] || 0) + g.nameplateMW;
    // 사이즈 버킷
    for (const b of category.sizeBuckets) {
      if (g.nameplateMW <= b.max) { bySize[b.label].count++; bySize[b.label].MW += g.nameplateMW; break; }
    }
  }

  const sortByValue = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

  return {
    _meta: {
      id: 'eia860-2024-' + category.id,
      sourceURL: 'https://www.eia.gov/electricity/data/eia860/',
      releaseDate: '2025-09-09',
      reportingYear: 2024,
      filter: {
        primeMover: category.primeMover,
        energySourceCodes: Array.from(GAS_FUEL_CODES)
      },
      categoryLabel: category.label,
      fetchDate: new Date().toISOString().slice(0, 10),
      sourceCategory: '정부공공',
      redistributionRisk: '🟢 — public domain',
      verificationNote: 'Authoritative US ' + category.label + ' installed-capacity dataset, Reporting Year 2024 (latest EIA release). Filter: Prime Mover code = ' + category.primeMover + ', Energy Source ∈ {NG, LFG, OBG, OG, PG, AB} (디젤·석유 제외).'
    },
    summary: {
      total_us_units: generators.length,
      total_us_nameplate_MW: Math.round(totalMW * 10) / 10,
      by_state_MW: Object.fromEntries(sortByValue(byState).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      top_operators_MW: Object.fromEntries(sortByValue(byOperator).slice(0, 20).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      by_operating_year_MW: Object.fromEntries(
        Object.entries(byYear).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [k, Math.round(v * 10) / 10])
      ),
      by_size_bucket: Object.fromEntries(
        Object.entries(bySize).map(([k, v]) => [k, { count: v.count, MW: Math.round(v.MW * 10) / 10 }])
      )
    },
    generators
  };
}

// =========================================================================
// 콘솔 요약
// =========================================================================

function printSummary(result, category) {
  const s = result.summary;
  console.log('\n========================================');
  console.log('  EIA-860 2024 — ' + category.label);
  console.log('========================================');
  console.log('  총 발전기: ' + s.total_us_units);
  console.log('  총 nameplate 용량: ' + s.total_us_nameplate_MW.toLocaleString() + ' MW');
  console.log('');
  console.log('  주별 (상위 10):');
  Object.entries(s.by_state_MW).slice(0, 10).forEach(([st, mw]) => {
    const pct = ((mw / s.total_us_nameplate_MW) * 100).toFixed(1);
    console.log('    ' + (st + '            ').slice(0, 12) + (mw.toLocaleString() + ' MW').padStart(12) + '   (' + pct + '%)');
  });
  console.log('');
  console.log('  사이즈 분포:');
  Object.entries(s.by_size_bucket).forEach(([label, v]) => {
    const pct = ((v.MW / s.total_us_nameplate_MW) * 100).toFixed(1);
    console.log('    ' + label.padEnd(50) + (v.count + ' units').padStart(11) + ' / ' + (v.MW.toLocaleString() + ' MW').padStart(11) + '   (' + pct + '%)');
  });
  console.log('');
  console.log('  Operator 상위 10:');
  Object.entries(s.top_operators_MW).slice(0, 10).forEach(([op, mw]) => {
    console.log('    ' + (op || '(unknown)').slice(0, 40).padEnd(42) + (mw.toLocaleString() + ' MW').padStart(12));
  });
  console.log('');
  console.log('  최근 10년 신규 추가 (BOL):');
  const recentYears = Object.entries(s.by_operating_year_MW).filter(([y]) => Number(y) >= 2015);
  recentYears.forEach(([y, mw]) => {
    console.log('    ' + y + '   ' + (mw.toLocaleString() + ' MW').padStart(12));
  });
  console.log('========================================\n');
}

// =========================================================================
// 메인
// =========================================================================

(async () => {
  try {
    console.log('EIA-860 2024 gas turbine + reciprocating extractor (Onsite Power Intelligence)\n');

    await downloadIfNeeded(EIA860_ZIP_URL, ZIP_PATH);

    const workbook = extractGeneratorWorkbook(ZIP_PATH);
    console.log('[시트 목록] ' + workbook.SheetNames.join(', '));
    const sheet = findGeneratorSheet(workbook);
    const rows = parseRows(sheet);
    console.log('[총 행 수] ' + rows.length);

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // 두 카테고리 각각 처리
    for (const category of CATEGORIES) {
      const result = filterAndAggregate(rows, category);
      fs.writeFileSync(category.outputJson, JSON.stringify(result, null, 2));
      console.log('[저장] ' + category.outputJson);
      printSummary(result, category);
    }

    console.log('완료. provenance.md GT-001/GT-007 entry를 verified로 업데이트하세요.\n');
  } catch (err) {
    console.error('\n[실패] ' + err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
