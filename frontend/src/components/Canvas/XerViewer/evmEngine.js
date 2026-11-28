/**
 * evmEngine.js
 * Pure-frontend deterministic EVM, S-Curve, WBS Cost/Schedule Variance,
 * and Workforce/Craft Demand engine computed directly from Primavera P6 .xer tables.
 * Zero manual data entry required.
 */

function downloadCsv(headers, rows, filename) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function formatMetricValue(val, unitMode = 'currency') {
  const num = Number(val || 0);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (unitMode === 'currency') {
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  }
  const suffix = unitMode === 'hours' ? ' hrs' : ' d';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M${suffix}`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K${suffix}`;
  return `${sign}${Math.round(abs).toLocaleString()}${suffix}`;
}

function parseDateSafe(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeEvmAndSCurve(xerData) {
  const tasks = xerData?.tasks || [];
  const rawTaskRsrc = xerData?.tables?.get('TASKRSRC') || [];
  const wbsMap = xerData?.wbsMap || new Map();
  const project = xerData?.project || null;

  // Map TASKRSRC cost & quantity totals per task_id
  const rsrcByTask = new Map();
  let sumTargetCost = 0;
  let sumTargetQty = 0;

  rawTaskRsrc.forEach((tr) => {
    const tid = tr.task_id;
    if (!tid) return;
    const tCost = parseFloat(tr.target_cost || '0') || 0;
    const aCost =
      (parseFloat(tr.act_reg_cost || '0') || 0) +
      (parseFloat(tr.act_ot_cost || '0') || 0);
    const tQty = parseFloat(tr.target_qty || '0') || 0;
    const aQty =
      (parseFloat(tr.act_reg_qty || '0') || 0) +
      (parseFloat(tr.act_ot_qty || '0') || 0) ||
      (parseFloat(tr.act_qty || '0') || 0);

    sumTargetCost += tCost;
    sumTargetQty += tQty;

    const prev = rsrcByTask.get(tid) || { tCost: 0, aCost: 0, tQty: 0, aQty: 0 };
    prev.tCost += tCost;
    prev.aCost += aCost;
    prev.tQty += tQty;
    prev.aQty += aQty;
    rsrcByTask.set(tid, prev);
  });

  // Choose unit mode automatically based on what the XER contains
  const unitMode =
    sumTargetCost > 0 ? 'currency' : sumTargetQty > 0 ? 'hours' : 'days';

  const bounds = xerData?.bounds || {};
  const minStart = bounds.minStart ? new Date(bounds.minStart) : new Date();
  const maxFinish = bounds.maxFinish ? new Date(bounds.maxFinish) : new Date(minStart.getTime() + 30 * 86400000);
  const dataDate =
    parseDateSafe(project?.last_recalc_date) ||
    parseDateSafe(project?.plan_start_date) ||
    new Date((minStart.getTime() + maxFinish.getTime()) / 2);

  let bac = 0;
  let pv = 0;
  let ev = 0;
  let ac = 0;
  let criticalCount = 0;
  let criticalExposure = 0;

  const wbsRollup = new Map();

  const taskRecords = tasks.map((t) => {
    const r = rsrcByTask.get(t.task_id) || { tCost: 0, aCost: 0, tQty: 0, aQty: 0 };
    let taskBac = 0;
    let taskAc = 0;

    if (unitMode === 'currency') {
      taskBac = r.tCost;
      taskAc = r.aCost;
    } else if (unitMode === 'hours') {
      taskBac = r.tQty;
      taskAc = r.aQty;
    } else {
      taskBac = Math.max(1, t.originalDurationDays || 1);
      taskAc = (taskBac * (t.percentComplete || 0)) / 100;
    }

    const pct = Math.max(0, Math.min(100, t.isCompleted ? 100 : Number(t.percentComplete || 0)));
    const taskEv = (taskBac * pct) / 100;
    // If AC is missing in XER for an active/completed task with EV, keep AC = 0 unless actuals exist
    const sDate = parseDateSafe(t.startDate) || minStart;
    const fDate = parseDateSafe(t.finishDate) || sDate;

    let pvRatio = 0;
    if (dataDate >= fDate) pvRatio = 1;
    else if (dataDate > sDate && fDate > sDate) {
      pvRatio = (dataDate.getTime() - sDate.getTime()) / (fDate.getTime() - sDate.getTime());
    }
    const taskPv = taskBac * pvRatio;

    bac += taskBac;
    pv += taskPv;
    ev += taskEv;
    ac += taskAc;

    if (t.isCritical && !t.isCompleted) {
      criticalCount += 1;
      criticalExposure += Math.max(0, taskBac - taskEv);
    }

    const wbsId = t.wbs_id || 'UNASSIGNED';
    if (!wbsRollup.has(wbsId)) {
      const wObj = wbsMap.get(wbsId);
      wbsRollup.set(wbsId, {
        wbsId,
        name: wObj?.fullPath || wObj?.name || wbsId,
        code: wObj?.code || '',
        taskCount: 0,
        criticalCount: 0,
        bac: 0,
        pv: 0,
        ev: 0,
        ac: 0,
      });
    }
    const wr = wbsRollup.get(wbsId);
    wr.taskCount += 1;
    if (t.isCritical && !t.isCompleted) wr.criticalCount += 1;
    wr.bac += taskBac;
    wr.pv += taskPv;
    wr.ev += taskEv;
    wr.ac += taskAc;

    return {
      taskBac,
      taskEv,
      taskAc,
      sDate,
      fDate,
      actStart: parseDateSafe(t.actualStart) || sDate,
      actEnd: parseDateSafe(t.actualFinish) || (t.isCompleted ? fDate : dataDate),
    };
  });

  const spi = pv > 0 ? ev / pv : 1;
  const cpi = ac > 0 ? ev / ac : 1;
  const sv = ev - pv;
  const cv = ev - ac;
  const eac = cpi > 0 ? bac / cpi : bac;

  // Build S-Curve time buckets (up to 18 evenly spaced buckets)
  const totalSpanMs = Math.max(7 * 86400000, maxFinish.getTime() - minStart.getTime());
  const bucketCount = Math.min(18, Math.max(6, Math.ceil(totalSpanMs / (14 * 86400000))));
  const stepMs = totalSpanMs / bucketCount;
  const buckets = [];

  for (let i = 0; i <= bucketCount; i++) {
    const tMs = minStart.getTime() + i * stepMs;
    const bDate = new Date(tMs);
    let cumPv = 0;
    let cumEv = 0;
    let cumAc = 0;
    const isFuture = tMs > dataDate.getTime();

    for (let j = 0; j < taskRecords.length; j++) {
      const tr = taskRecords[j];
      const sMs = tr.sDate.getTime();
      const fMs = Math.max(sMs + 1, tr.fDate.getTime());
      let rPv = 0;
      if (tMs >= fMs) rPv = 1;
      else if (tMs > sMs) rPv = (tMs - sMs) / (fMs - sMs);
      cumPv += tr.taskBac * rPv;

      if (!isFuture) {
        const asMs = tr.actStart.getTime();
        const aeMs = Math.max(asMs + 1, Math.min(dataDate.getTime(), tr.actEnd.getTime()));
        let rEv = 0;
        if (tMs >= aeMs) rEv = 1;
        else if (tMs > asMs) rEv = (tMs - asMs) / (aeMs - asMs);
        cumEv += tr.taskEv * rEv;
        cumAc += tr.taskAc * rEv;
      }
    }

    buckets.push({
      label: bDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
      pv: cumPv,
      ev: isFuture ? null : cumEv,
      ac: isFuture ? null : cumAc,
    });
  }

  const wbsRows = Array.from(wbsRollup.values())
    .map((w) => {
      const wSpi = w.pv > 0 ? w.ev / w.pv : 1;
      const wCpi = w.ac > 0 ? w.ev / w.ac : 1;
      const pct = w.bac > 0 ? Math.round((w.ev / w.bac) * 100) : 0;
      let health = 'On Track';
      if (wSpi < 0.85 || (w.ac > 0 && wCpi < 0.85)) health = 'Critical';
      else if (wSpi < 0.95 || (w.ac > 0 && wCpi < 0.95)) health = 'Watch';
      return {
        ...w,
        spi: wSpi,
        cpi: wCpi,
        sv: w.ev - w.pv,
        cv: w.ev - w.ac,
        pct,
        health,
      };
    })
    .sort((a, b) => b.bac - a.bac);

  return {
    unitMode,
    dataDate,
    bac,
    pv,
    ev,
    ac,
    spi,
    cpi,
    sv,
    cv,
    eac,
    criticalCount,
    criticalExposure,
    buckets,
    wbsRows,
  };
}

export function computeWorkforceLoad(xerData, horizonWeeks = 0) {
  const tasks = xerData?.tasks || [];
  const rawTaskRsrc = xerData?.tables?.get('TASKRSRC') || [];
  const rawRsrc = xerData?.tables?.get('RSRC') || [];
  const project = xerData?.project || null;

  const rsrcMetaMap = new Map();
  rawRsrc.forEach((r) => {
    if (r.rsrc_id) {
      rsrcMetaMap.set(r.rsrc_id, {
        id: r.rsrc_id,
        name: r.rsrc_name || r.rsrc_short_name || `Resource ${r.rsrc_id}`,
        shortName: r.rsrc_short_name || '',
        type: (r.rsrc_type || 'RT_Labor').replace('RT_', ''),
      });
    }
  });

  const taskMap = new Map();
  tasks.forEach((t) => taskMap.set(t.task_id, t));

  const bounds = xerData?.bounds || {};
  const minStart = bounds.minStart ? new Date(bounds.minStart) : new Date();
  const maxFinish = bounds.maxFinish ? new Date(bounds.maxFinish) : new Date(minStart.getTime() + 28 * 86400000);
  const dataDate =
    parseDateSafe(project?.last_recalc_date) ||
    parseDateSafe(project?.plan_start_date) ||
    minStart;

  const windowStart = horizonWeeks > 0 ? dataDate : minStart;
  const windowEnd =
    horizonWeeks > 0
      ? new Date(dataDate.getTime() + horizonWeeks * 7 * 86400000)
      : maxFinish;

  const craftMap = new Map();
  const weekBucketsMap = new Map();

  // Group into weekly buckets (cap at 24 weeks for clean histogram)
  const spanMs = Math.max(7 * 86400000, windowEnd.getTime() - windowStart.getTime());
  const numWeeks = Math.min(24, Math.max(3, Math.ceil(spanMs / (7 * 86400000))));
  const weekStepMs = spanMs / numWeeks;

  for (let i = 0; i < numWeeks; i++) {
    const d = new Date(windowStart.getTime() + i * weekStepMs);
    weekBucketsMap.set(i, {
      idx: i,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      plannedHrs: 0,
      actualHrs: 0,
      remainHrs: 0,
    });
  }

  let totalPlannedHrs = 0;
  let totalActualHrs = 0;
  let totalRemainHrs = 0;

  rawTaskRsrc.forEach((tr) => {
    const task = taskMap.get(tr.task_id);
    if (!task) return;
    const sDate = parseDateSafe(task.startDate) || minStart;
    const fDate = parseDateSafe(task.finishDate) || sDate;
    if (fDate < windowStart || sDate > windowEnd) return;

    const rMeta = rsrcMetaMap.get(tr.rsrc_id) || {
      id: tr.rsrc_id || 'UNASSIGNED',
      name: `Resource ${tr.rsrc_id || 'Unassigned'}`,
      shortName: '',
      type: 'Labor',
    };

    const targetQty = parseFloat(tr.target_qty || '0') || 0;
    const actQty =
      (parseFloat(tr.act_reg_qty || '0') || 0) +
      (parseFloat(tr.act_ot_qty || '0') || 0) ||
      (parseFloat(tr.act_qty || '0') || 0);
    const remainQty =
      tr.remain_qty !== undefined && tr.remain_qty !== ''
        ? parseFloat(tr.remain_qty) || 0
        : Math.max(0, targetQty - actQty);

    totalPlannedHrs += targetQty;
    totalActualHrs += actQty;
    totalRemainHrs += remainQty;

    if (!craftMap.has(rMeta.id)) {
      craftMap.set(rMeta.id, {
        ...rMeta,
        taskIds: new Set(),
        criticalTaskIds: new Set(),
        overdueTaskIds: new Set(),
        plannedHrs: 0,
        actualHrs: 0,
        remainHrs: 0,
      });
    }
    const c = craftMap.get(rMeta.id);
    c.taskIds.add(task.task_id);
    if (task.isCritical && !task.isCompleted) c.criticalTaskIds.add(task.task_id);
    if (fDate < dataDate && !task.isCompleted) c.overdueTaskIds.add(task.task_id);
    c.plannedHrs += targetQty;
    c.actualHrs += actQty;
    c.remainHrs += remainQty;

    // Distribute task hours across overlapping weekly buckets
    const taskStartMs = Math.max(windowStart.getTime(), sDate.getTime());
    const taskEndMs = Math.min(windowEnd.getTime(), Math.max(taskStartMs + 1, fDate.getTime()));
    const firstBucket = Math.max(0, Math.floor((taskStartMs - windowStart.getTime()) / weekStepMs));
    const lastBucket = Math.min(numWeeks - 1, Math.floor((taskEndMs - windowStart.getTime()) / weekStepMs));
    const bucketSpan = Math.max(1, lastBucket - firstBucket + 1);

    for (let b = firstBucket; b <= lastBucket; b++) {
      const wb = weekBucketsMap.get(b);
      if (wb) {
        wb.plannedHrs += targetQty / bucketSpan;
        wb.actualHrs += actQty / bucketSpan;
        wb.remainHrs += remainQty / bucketSpan;
      }
    }
  });

  const crafts = Array.from(craftMap.values())
    .map((c) => ({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      type: c.type,
      taskCount: c.taskIds.size,
      criticalCount: c.criticalTaskIds.size,
      overdueCount: c.overdueTaskIds.size,
      plannedHrs: c.plannedHrs,
      actualHrs: c.actualHrs,
      remainHrs: c.remainHrs,
      burnPct: c.plannedHrs > 0 ? Math.round((c.actualHrs / c.plannedHrs) * 100) : 0,
    }))
    .sort((a, b) => b.plannedHrs - a.plannedHrs);

  const weeklyHistogram = Array.from(weekBucketsMap.values());
  const peakWeek = weeklyHistogram.reduce(
    (best, cur) => (cur.plannedHrs > best.plannedHrs ? cur : best),
    weeklyHistogram[0] || { label: '-', plannedHrs: 0 }
  );

  return {
    crafts,
    weeklyHistogram,
    totalPlannedHrs,
    totalActualHrs,
    totalRemainHrs,
    peakWeek,
  };
}

export function exportEvmCsv(evm, filename = 'schedule.xer') {
  const clean = filename.replace(/\.[^/.]+$/, '');
  const rows = evm.wbsRows.map((w) => [
    w.code || w.wbsId,
    w.name,
    w.taskCount,
    w.criticalCount,
    `${w.pct}%`,
    w.bac.toFixed(2),
    w.pv.toFixed(2),
    w.ev.toFixed(2),
    w.ac.toFixed(2),
    w.spi.toFixed(2),
    w.cpi.toFixed(2),
    w.sv.toFixed(2),
    w.cv.toFixed(2),
    w.health,
  ]);
  downloadCsv(
    ['WBS Code', 'WBS Name', 'Tasks', 'Critical Tasks', 'Progress %', 'BAC', 'PV', 'EV', 'AC', 'SPI', 'CPI', 'SV', 'CV', 'Health'],
    rows,
    `${clean}_evm_report.csv`
  );
}

export function exportWorkforceCsv(wf, filename = 'schedule.xer') {
  const clean = filename.replace(/\.[^/.]+$/, '');
  const rows = wf.crafts.map((c) => [
    c.id,
    c.shortName || c.name,
    c.name,
    c.type,
    c.taskCount,
    c.criticalCount,
    c.overdueCount,
    c.plannedHrs.toFixed(1),
    c.actualHrs.toFixed(1),
    c.remainHrs.toFixed(1),
    `${c.burnPct}%`,
  ]);
  downloadCsv(
    ['Resource ID', 'Code', 'Craft / Resource Name', 'Type', 'Assigned Tasks', 'Critical Tasks', 'Overdue Tasks', 'Planned Hrs', 'Actual Hrs', 'Remaining Hrs', 'Burn %'],
    rows,
    `${clean}_workforce_load.csv`
  );
}
