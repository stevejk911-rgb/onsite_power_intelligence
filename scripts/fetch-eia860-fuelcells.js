#!/usr/bin/env node
/*
 * fetch-eia860-fuelcells.js
 *
 * EIA Form 860 (2024 reporting year, released 2025-09-09) 다운로드 →
 * Prime Mover = "FC" 발전기만 필터링 → 미국 fuel cell 현재 fleet 권위 있는 합계 계산.
 *
 * 사용법:
 *   1. cd /Users/sukju/Documents/Claude/Projects/ONSITE_POWER_INTELLIGENCE/onsite-power-app
 *   2. npm install xlsx adm-zip   (최초 한 번만)
 *   3. node scripts/fetch-eia860-fuelcells.js
 *
 * 출력:
 *   - data/fuelcells/eia860-2024-fuelcells.json (검증된 발전기 단위 데이터 + 합계)
 *   - 콘솔에 요약 (총 MW, 주별, OEM별, 가동연도별)
 *
 * 데이터 라이선스: EIA-860은 미국 정부 공공 도메인 (🟢)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 라이브러리는 require 안에서 동적 로드 → 미설치시 친절한 에러
let XLSX, AdmZip;
try {
  XLSX = require('xlsx');
  AdmZip = require('adm-zip');
} catch (e) {
  console.error('\n[X] 필수 모듈이 설치되어 있지 않습니다.');
  console.error('   다음 명령을 실행하세요:\n');
  console.error('   cd ' + path.resolve(__dirname, '..'));
  console.error('   npm install xlsx adm-zip\n');
  console.error('   그 다음 다시 이 스크립트를 실행하세요.\n');
  process.exit(1);
}

// =========================================================================
// 설정
// =========================================================================

// EIA-860 2024 reporting year ZIP (2025-09 release).
// 주의: EIA는 *현재 연도(가장 최신)*는 archive/ 없이, *이전 연도*는 archive/xls/ 에 둠.
// 즉 2024 = xls/eia8602024.zip / 2023 = archive/xls/eia8602023.zip.
// 다음 연도 데이터 release되면 2024 파일이 archive/로 이동.
// 만약 다운로드 실패면 https://www.eia.gov/electricity/data/eia860/ 페이지에서 현재 링크 확인 후 갱신.
const EIA860_ZIP_URL = 'https://www.eia.gov/electricity/data/eia860/xls/eia8602024.zip';

// 다운로드 캐시 (한 번 받으면 다시 받지 않음)
const OUT_DIR = path.resolve(__dirname, '..', 'data', 'fuelcells');
const CACHE_DIR = path.resolve(__dirname, '..', '.cache');
const ZIP_PATH = path.join(CACHE_DIR, 'eia8602024.zip');
const OUTPUT_JSON = path.join(OUT_DIR, 'eia860-2024-fuelcells.json');

// EIA-860 Schedule 3 Generator: Prime Mover = "FC" → 연료전지
// (참고: 다른 PM 코드 - GT=combustion turbine, IC=internal combustion engine, ST=steam turbine)
const PRIME_MOVER_FILTER = 'FC';

// =========================================================================
// 다운로드 (이미 캐시 있으면 스킵)
// =========================================================================

function downloadIfNeeded(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      const size = fs.statSync(dest).size;
      console.log('[캐시] 기존 ZIP 사용 (' + (size / 1024 / 1024).toFixed(1) + ' MB)');
      return resolve();
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    console.log('[다운로드] ' + url);
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'onsite-power-intelligence/0.1 research-tool' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // redirect 따라가기
        const newUrl = res.headers.location;
        console.log('  → redirect: ' + newUrl);
        file.close();
        fs.unlinkSync(dest);
        return downloadIfNeeded(newUrl, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error('HTTP ' + res.statusCode + ' — EIA URL이 변경된 것 같습니다. https://www.eia.gov/electricity/data/eia860/ 에서 최신 ZIP 링크를 확인해 스크립트 상단 EIA860_ZIP_URL을 갱신하세요.'));
      }
      // Content-Type 안전 검증 — HTML 리다이렉트 endpoint가 200으로 떨어지는 경우 잡기
      const ct = (res.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('text/plain')) {
        file.close();
        try { fs.unlinkSync(dest); } catch (e) {}
        return reject(new Error('서버가 ZIP이 아닌 ' + ct + ' 응답함 — URL이 잘못된 폴더로 redirect됐을 가능성. EIA-860 page에서 정확한 ZIP 링크 재확인.'));
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
// 파싱
// =========================================================================

function extractGeneratorWorkbook(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  // 2024 release에서 파일명은 일반적으로 '3_1_Generator_Y2024.xlsx'
  const generatorEntry = entries.find(e => /3_1_Generator.*\.xlsx$/i.test(e.entryName));
  if (!generatorEntry) {
    console.error('[X] ZIP 안에서 Generator XLSX를 못 찾았습니다. ZIP 내부 파일 목록:');
    entries.forEach(e => console.error('     - ' + e.entryName));
    throw new Error('Generator xlsx not found in ZIP');
  }
  console.log('[추출] ' + generatorEntry.entryName);
  const buffer = generatorEntry.getData();
  return XLSX.read(buffer, { type: 'buffer' });
}

function findGeneratorSheet(workbook) {
  // 시트는 보통 'Operable' (현재 운영중) — 다른 시트도 있음 (Proposed, Retired)
  const operable = workbook.SheetNames.find(n => /operable/i.test(n));
  return operable ? workbook.Sheets[operable] : workbook.Sheets[workbook.SheetNames[0]];
}

function parseRows(sheet) {
  // EIA-860은 상단에 2줄 헤더 비슷한 prefix가 있을 수 있음 (release note 등) — sheet_to_json + range 자동 인식 시도
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  // 헤더 행 찾기: 'Prime Mover' 또는 'Prime Mover Code' 열이 있는 첫 행
  const headerIdx = allRows.findIndex(row => row.some(cell => typeof cell === 'string' && /prime\s*mover/i.test(cell)));
  if (headerIdx === -1) {
    throw new Error('헤더 행에서 "Prime Mover" 열을 못 찾았습니다. 시트 구조 확인 필요.');
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

function filterAndAggregate(rows) {
  if (rows.length === 0) throw new Error('데이터 행이 없습니다.');
  const headers = Object.keys(rows[0]);

  const colPrimeMover = findCol(headers, '^prime\\s*mover$', 'prime\\s*mover\\s*code', 'prime\\s*mover');
  const colCapacityMW = findCol(headers, 'nameplate\\s*capacity', 'nameplate.*\\(mw\\)');
  const colState = findCol(headers, '^state$', 'state\\s*name');
  const colOperator = findCol(headers, 'utility\\s*name', 'operator\\s*name', 'plant\\s*operator');
  const colPlant = findCol(headers, '^plant\\s*name$');
  const colOperatingYear = findCol(headers, 'operating\\s*year', 'commercial.*year', 'in.*service.*year');
  const colTechnology = findCol(headers, 'technology', 'energy\\s*source');
  const colCountyOrCity = findCol(headers, '^county$', '^city$');
  const colStatus = findCol(headers, '^status$', 'operational\\s*status');

  console.log('[열 매핑]');
  console.log('  Prime Mover  → ' + colPrimeMover);
  console.log('  Capacity MW  → ' + colCapacityMW);
  console.log('  State        → ' + colState);
  console.log('  Operator     → ' + colOperator);
  console.log('  Plant        → ' + colPlant);
  console.log('  OperatingYr  → ' + colOperatingYear);

  if (!colPrimeMover || !colCapacityMW) {
    throw new Error('필수 열(Prime Mover 또는 Nameplate Capacity)을 찾지 못했습니다. 시트 구조 확인 필요.');
  }

  const fc = rows.filter(r => {
    const pm = r[colPrimeMover];
    return pm && String(pm).trim().toUpperCase() === PRIME_MOVER_FILTER;
  });

  console.log('\n[필터] Prime Mover = "FC" → ' + fc.length + '개 행');

  const generators = fc.map(r => ({
    plantName: r[colPlant],
    state: r[colState],
    operator: colOperator ? r[colOperator] : null,
    nameplateMW: typeof r[colCapacityMW] === 'number' ? r[colCapacityMW] : parseFloat(r[colCapacityMW]) || 0,
    operatingYear: colOperatingYear ? r[colOperatingYear] : null,
    technology: colTechnology ? r[colTechnology] : null,
    location: colCountyOrCity ? r[colCountyOrCity] : null,
    status: colStatus ? r[colStatus] : null,
    _raw_keys: headers // 디버그: 첫 행에서 보기 위한 전체 헤더는 별도 저장 안 함
  }));

  const totalMW = generators.reduce((s, g) => s + (g.nameplateMW || 0), 0);
  const byState = {};
  const byYear = {};
  const byOperator = {};
  for (const g of generators) {
    if (g.state) byState[g.state] = (byState[g.state] || 0) + g.nameplateMW;
    if (g.operatingYear) byYear[g.operatingYear] = (byYear[g.operatingYear] || 0) + g.nameplateMW;
    if (g.operator) byOperator[g.operator] = (byOperator[g.operator] || 0) + g.nameplateMW;
  }

  // 정렬된 요약
  const sortByValue = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

  return {
    _meta: {
      id: 'eia860-2024-fuelcells',
      sourceURL: 'https://www.eia.gov/electricity/data/eia860/',
      releaseDate: '2025-09-09',
      reportingYear: 2024,
      filter: { primeMover: PRIME_MOVER_FILTER },
      fetchDate: new Date().toISOString().slice(0, 10),
      sourceCategory: '정부공공',
      redistributionRisk: '🟢 — public domain',
      verificationNote: 'Authoritative US fuel-cell installed-capacity dataset, Reporting Year 2024 (latest EIA release). Filter applied: Prime Mover code = FC.'
    },
    summary: {
      total_us_units: generators.length,
      total_us_nameplate_MW: Math.round(totalMW * 10) / 10,
      by_state_MW: Object.fromEntries(sortByValue(byState).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      top_operators_MW: Object.fromEntries(sortByValue(byOperator).slice(0, 20).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      by_operating_year_MW: Object.fromEntries(
        Object.entries(byYear).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [k, Math.round(v * 10) / 10])
      )
    },
    generators: generators.map(g => {
      const { _raw_keys, ...rest } = g; // 디버그용 키 제거
      return rest;
    })
  };
}

// =========================================================================
// 콘솔 요약
// =========================================================================

function printSummary(result) {
  const s = result.summary;
  console.log('\n========================================');
  console.log('  EIA-860 2024 — 미국 연료전지 fleet');
  console.log('========================================');
  console.log('  총 발전기: ' + s.total_us_units);
  console.log('  총 nameplate 용량: ' + s.total_us_nameplate_MW + ' MW');
  console.log('');
  console.log('  주별 (상위 10):');
  Object.entries(s.by_state_MW).slice(0, 10).forEach(([st, mw]) => {
    const pct = ((mw / s.total_us_nameplate_MW) * 100).toFixed(1);
    console.log('    ' + (st + '            ').slice(0, 12) + (mw + ' MW').padStart(10) + '   (' + pct + '%)');
  });
  console.log('');
  console.log('  Operator 상위 10:');
  Object.entries(s.top_operators_MW).slice(0, 10).forEach(([op, mw]) => {
    console.log('    ' + (op || '(unknown)').slice(0, 40).padEnd(42) + (mw + ' MW').padStart(10));
  });
  console.log('');
  console.log('  가동 연도 (최근 10년):');
  const years = Object.entries(s.by_operating_year_MW).filter(([y]) => Number(y) >= 2015);
  years.forEach(([y, mw]) => {
    console.log('    ' + y + '   ' + (mw + ' MW').padStart(10));
  });
  console.log('========================================\n');
}

// =========================================================================
// 메인
// =========================================================================

(async () => {
  try {
    console.log('EIA-860 2024 fuel cell extractor (Onsite Power Intelligence)\n');

    await downloadIfNeeded(EIA860_ZIP_URL, ZIP_PATH);

    const workbook = extractGeneratorWorkbook(ZIP_PATH);
    console.log('[시트 목록] ' + workbook.SheetNames.join(', '));
    const sheet = findGeneratorSheet(workbook);
    const rows = parseRows(sheet);
    console.log('[총 행 수] ' + rows.length);

    const result = filterAndAggregate(rows);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
    console.log('[저장] ' + OUTPUT_JSON);

    printSummary(result);

    console.log('완료. provenance.md의 FC-002 entry를 verified로 업데이트하세요.\n');
  } catch (err) {
    console.error('\n[실패] ' + err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
