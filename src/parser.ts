import type { ParsedGraph, JobInfo, InCond, OutCond } from "./types";

export function parseControlMXML(xmlStr: string): ParsedGraph {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr.trim(), "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    const msg = parseError.textContent ?? "";
    throw new Error("XML 파싱 오류: " + msg.slice(0, 300));
  }

  const jobElements = Array.from(doc.querySelectorAll("JOB"));
  if (jobElements.length === 0) {
    throw new Error(
      "JOB 엘리먼트를 찾을 수 없습니다. Control-M XML 형식인지 확인하세요."
    );
  }

  const jobs: JobInfo[] = [];

  for (const jobEl of jobElements) {
    const name =
      jobEl.getAttribute("JOBNAME") ||
      jobEl.getAttribute("JOB_NAME") ||
      "";
    if (!name) continue;

    const folderEl =
      jobEl.closest("FOLDER") || jobEl.closest("SMART_FOLDER");

    const inConds: InCond[] = [];
    const outConds: OutCond[] = [];

    for (const cond of Array.from(jobEl.querySelectorAll("INCOND"))) {
      const condName = cond.getAttribute("NAME") ?? "";
      if (condName) {
        inConds.push({
          name: condName,
          odate: cond.getAttribute("ODATE") ?? "ODAT",
          andOr: cond.getAttribute("AND_OR") ?? "AND",
        });
      }
    }

    for (const cond of Array.from(jobEl.querySelectorAll("OUTCOND"))) {
      const condName = cond.getAttribute("NAME") ?? "";
      if (condName) {
        outConds.push({
          name: condName,
          odate: cond.getAttribute("ODATE") ?? "ODAT",
          sign: cond.getAttribute("SIGN") ?? "+",
        });
      }
    }

    jobs.push({
      name,
      application: jobEl.getAttribute("APPLICATION") ?? undefined,
      subApplication: jobEl.getAttribute("SUB_APPLICATION") ?? undefined,
      taskType:
        jobEl.getAttribute("TASKTYPE") ??
        jobEl.getAttribute("TASK_TYPE") ??
        undefined,
      folder: folderEl?.getAttribute("FOLDER_NAME") ?? undefined,
    inConds,
      outConds,
    });
  }

  // OUTCOND(SIGN="+") → INCOND 조건명 매칭으로 의존성 추출
  const condProducers = new Map<string, string>();
  for (const job of jobs) {
    for (const cond of job.outConds) {
      if (cond.sign === "+") {
        condProducers.set(cond.name, job.name);
      }
    }
  }

  const edges: ParsedGraph["edges"] = [];
  const edgeSet = new Set<string>();

  for (const job of jobs) {
    for (const cond of job.inConds) {
      const producer = condProducers.get(cond.name);
      if (producer && producer !== job.name) {
        const key = `${producer}→${job.name}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: producer, to: job.name, condName: cond.name });
        }
      }
    }
  }

  return { jobs, edges };
}

export const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DEFTABLE>
  <JOB JOBNAME="JOB_START" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <OUTCOND NAME="START_OK" ODATE="ODAT" SIGN="+" />
  </JOB>
  <JOB JOBNAME="JOB_EXTRACT_A" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <INCOND NAME="START_OK" ODATE="ODAT" AND_OR="AND" />
    <OUTCOND NAME="EXTRACT_A_OK" ODATE="ODAT" SIGN="+" />
  </JOB>
  <JOB JOBNAME="JOB_EXTRACT_B" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <INCOND NAME="START_OK" ODATE="ODAT" AND_OR="AND" />
    <OUTCOND NAME="EXTRACT_B_OK" ODATE="ODAT" SIGN="+" />
  </JOB>
  <JOB JOBNAME="JOB_TRANSFORM" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <INCOND NAME="EXTRACT_A_OK" ODATE="ODAT" AND_OR="AND" />
    <INCOND NAME="EXTRACT_B_OK" ODATE="ODAT" AND_OR="AND" />
    <OUTCOND NAME="TRANSFORM_OK" ODATE="ODAT" SIGN="+" />
  </JOB>
  <JOB JOBNAME="JOB_LOAD_DW" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <INCOND NAME="TRANSFORM_OK" ODATE="ODAT" AND_OR="AND" />
    <OUTCOND NAME="LOAD_DW_OK" ODATE="ODAT" SIGN="+" />
  </JOB>
  <JOB JOBNAME="JOB_LOAD_MART" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <INCOND NAME="TRANSFORM_OK" ODATE="ODAT" AND_OR="AND" />
    <OUTCOND NAME="LOAD_MART_OK" ODATE="ODAT" SIGN="+" />
  </JOB>
  <JOB JOBNAME="JOB_REPORT" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <INCOND NAME="LOAD_DW_OK" ODATE="ODAT" AND_OR="AND" />
    <INCOND NAME="LOAD_MART_OK" ODATE="ODAT" AND_OR="AND" />
    <OUTCOND NAME="REPORT_OK" ODATE="ODAT" SIGN="+" />
  </JOB>
  <JOB JOBNAME="JOB_ARCHIVE" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <INCOND NAME="LOAD_DW_OK" ODATE="ODAT" AND_OR="AND" />
    <OUTCOND NAME="ARCHIVE_OK" ODATE="ODAT" SIGN="+" />
  </JOB>
  <JOB JOBNAME="JOB_NOTIFY" APPLICATION="FINANCE" SUB_APPLICATION="DAILY" TASKTYPE="Command">
    <INCOND NAME="REPORT_OK" ODATE="ODAT" AND_OR="AND" />
    <INCOND NAME="ARCHIVE_OK" ODATE="ODAT" AND_OR="AND" />
  </JOB>
</DEFTABLE>`;
