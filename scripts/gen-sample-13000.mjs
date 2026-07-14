/**
 * sample_complex_1000.xml 과 동일 토폴로지로 N개 잡 생성
 * ROOT(1) -> L1 -> L2(L1/2 합류) -> L3(L2*3 분기) -> L4(L3쌍 + L1 교차) -> FINAL(1)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'sample_complex_13000.xml');

const TOTAL = 13000;
const GROUPS = [
  '01.수신', '02.검증', '03.변환', '04.적재', '05.집계',
  '06.정산', '07.보고', '08.전송', '09.마감', '10.모니터링',
];

// 1000 기준(250/125/375/248) 비율 ×13
const L1N = 3250;
const L2N = 1625; // L1/2
const L3N = 4875; // L2*3
const L4N = TOTAL - 1 - L1N - L2N - L3N - 1; // 3248
if (L4N < 1 || L4N > Math.min(L3N - 1, L1N)) {
  throw new Error(`Invalid L4N=${L4N}`);
}

const APP = 'CMP01.복합의존';
const FOLDER = '99.복합의존13000';

function pad(n, w = 5) {
  return String(n).padStart(w, '0');
}

function jobName(series, seq) {
  // series 1자리 + seq 5자리 → BCMP000001 / BCMP100001 / BCMP900001
  return `BCMP${series}${pad(seq)}_S01`;
}

function memName(series, seq) {
  return `bcmp${series}${pad(seq)}_s01.sh`;
}

function groupOf(i) {
  return GROUPS[i % GROUPS.length];
}

function jobXml({ isn, series, seq, group, desc, inNames }) {
  const name = jobName(series, seq);
  const mem = memName(series, seq);
  const ins = (inNames || [])
    .map(n => `    <INCOND NAME="${n}-OK" ODATE="ODAT" AND_OR="A"/>`)
    .join('\n');
  const out = `    <OUTCOND NAME="${name}-OK" ODATE="ODAT" SIGN="+"/>`;
  const body = [ins, out].filter(Boolean).join('\n');
  return `  <JOB JOBISN="${isn}" APPLICATION="${APP}" SUB_APPLICATION="${group}" MEMNAME="${mem}" JOBNAME="${name}" DESCRIPTION="${desc}" RUN_AS="btapp" PRIORITY="AA" CRITICAL="0" TASKTYPE="Command" CYCLIC="0" NODEID="ccorap01" MEMLIB="/shrdat/batch/cmp/shl/" CMDLINE="/shrdat/batch/cmp/shl/${mem} %%$ODATE" DAYSCAL="DAILY" TIMEFROM="0100" MAXWAIT="7">
${body}
  </JOB>\n`;
}

const ws = fs.createWriteStream(OUT, { encoding: 'utf8' });
ws.write(`<?xml version="1.0" encoding="UTF-8"?>
<!-- Complex fan-out / join / cross-edge sample (${TOTAL} jobs, 10 groups)
     ROOT(1) -> L1(${L1N}) -> L2(${L2N}) -> L3(${L3N}) -> L4(${L4N}, looks back to L1) -> FINAL(1)
     Groups: ${GROUPS.join(', ')}
     Total jobs: ${TOTAL} -->
<DEFTABLE xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Folder.xsd">
<FOLDER DATACENTER="scmsap11" VERSION="921" PLATFORM="UNIX" FOLDER_NAME="${FOLDER}" FOLDER_ORDER_METHOD="SYSTEM" TYPE="1">
`);

let isn = 1;
const l1 = [];
const l2 = [];
const l3 = [];
const l4 = [];

// ROOT
const rootName = jobName(0, 1);
ws.write(jobXml({
  isn: isn++,
  series: 0,
  seq: 1,
  group: GROUPS[0],
  desc: '시작 배치 (루트)',
  inNames: [],
}));

// L1
for (let i = 1; i <= L1N; i++) {
  const name = jobName(1, i);
  l1.push(name);
  ws.write(jobXml({
    isn: isn++,
    series: 1,
    seq: i,
    group: groupOf(i - 1),
    desc: `1차 후행 #${i}`,
    inNames: [rootName],
  }));
  if (i % 2000 === 0) console.log(`L1 ${i}/${L1N}`);
}

// L2: pair consecutive L1
for (let i = 1; i <= L2N; i++) {
  const name = jobName(2, i);
  l2.push(name);
  const a = l1[(i - 1) * 2];
  const b = l1[(i - 1) * 2 + 1];
  ws.write(jobXml({
    isn: isn++,
    series: 2,
    seq: i,
    group: groupOf(i - 1),
    desc: `2차 후행 #${i} (L1 합류)`,
    inNames: [a, b],
  }));
}
console.log(`L2 ${L2N} done`);

// L3: 3 per L2
for (let i = 1; i <= L3N; i++) {
  const name = jobName(3, i);
  l3.push(name);
  const parent = l2[Math.floor((i - 1) / 3)];
  ws.write(jobXml({
    isn: isn++,
    series: 3,
    seq: i,
    group: groupOf(i - 1),
    desc: `3차 후행 #${i} (L2 분기)`,
    inNames: [parent],
  }));
  if (i % 2000 === 0) console.log(`L3 ${i}/${L3N}`);
}

// L4: sliding L3 pair + L1 cross-ref
for (let i = 1; i <= L4N; i++) {
  const name = jobName(4, i);
  l4.push(name);
  ws.write(jobXml({
    isn: isn++,
    series: 4,
    seq: i,
    group: groupOf(i - 1),
    desc: `4차 후행 #${i} (L3 + L1 교차참조)`,
    inNames: [l3[i - 1], l3[i], l1[i - 1]],
  }));
  if (i % 2000 === 0) console.log(`L4 ${i}/${L4N}`);
}

// FINAL
ws.write(jobXml({
  isn: isn++,
  series: 9,
  seq: 1,
  group: GROUPS[8],
  desc: '최종 마감 (L4 전체 합류)',
  inNames: l4,
}));

ws.write(`</FOLDER>
</DEFTABLE>
`);

ws.end(() => {
  const st = fs.statSync(OUT);
  console.log(`Wrote ${OUT}`);
  console.log(`jobs=${isn - 1} expected=${TOTAL} size=${(st.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`layers ROOT=1 L1=${L1N} L2=${L2N} L3=${L3N} L4=${L4N} FINAL=1`);
});
