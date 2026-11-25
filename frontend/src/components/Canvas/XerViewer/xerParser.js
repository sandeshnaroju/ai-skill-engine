/**
 * xerParser.js
 * Comprehensive parser for Primavera P6 XER relational export format.
 * Parses %T (table name), %F (fields), and %R (records) into structured models
 * with relational joins (WBS, Tasks, Dependencies, Resources, and Calendars).
 *
 * Supports both synchronous parsing for smaller files and asynchronous chunked
 * parsing with progress reporting for medium-to-large files (20MB+, ~25,000+ activities).
 */

export function assembleXerModel(tables) {
  // 1. PROJECT Master
  const projectRows = tables.get('PROJECT') || [];
  const project = projectRows.length > 0 ? projectRows[0] : null;

  // 2. CALENDAR Map
  const calendarRows = tables.get('CALENDAR') || [];
  const calendarMap = new Map();
  calendarRows.forEach((c) => {
    if (c.clndr_id) {
      calendarMap.set(c.clndr_id, c.clndr_name || `Calendar ${c.clndr_id}`);
    }
  });

  // 3. WBS Hierarchy (PROJWBS)
  const wbsRows = tables.get('PROJWBS') || [];
  const wbsMap = new Map();
  const wbsList = [];

  wbsRows.forEach((w) => {
    const item = {
      wbs_id: w.wbs_id,
      parent_wbs_id: w.parent_wbs_id || null,
      code: w.wbs_short_name || '',
      name: w.wbs_name || '',
      status: w.status_code || '',
      fullPath: w.wbs_name || '',
      level: 0,
      children: [],
      taskCount: 0,
      completedTaskCount: 0
    };
    wbsMap.set(w.wbs_id, item);
    wbsList.push(item);
  });

  // Build tree & compute full path
  const wbsTree = [];
  wbsList.forEach((item) => {
    if (item.parent_wbs_id && wbsMap.has(item.parent_wbs_id)) {
      const parent = wbsMap.get(item.parent_wbs_id);
      parent.children.push(item);
    } else {
      wbsTree.push(item);
    }
  });

  function resolveWbsPath(item, parentPath = '') {
    const currentName = item.code ? `${item.code} - ${item.name}` : item.name;
    item.fullPath = parentPath ? `${parentPath} > ${currentName}` : currentName;
    item.children.forEach((child) => {
      child.level = item.level + 1;
      resolveWbsPath(child, item.fullPath);
    });
  }
  wbsTree.forEach((root) => resolveWbsPath(root));

  // 4. PREDECESSORS & DEPENDENCIES (TASKPRED)
  const predRows = tables.get('TASKPRED') || [];
  const predMap = new Map();
  const succMap = new Map();

  predRows.forEach((p) => {
    const tid = p.task_id;
    const pid = p.pred_task_id;
    const linkType = (p.pred_type || 'PR_FS').replace('PR_', '');
    const lagHours = parseFloat(p.lag_hr_cnt || '0');
    const lagDays = lagHours !== 0 ? Math.round(lagHours / 8) : 0;
    const lagStr = lagDays !== 0 ? (lagDays > 0 ? `+${lagDays}d` : `${lagDays}d`) : '';

    if (tid) {
      if (!predMap.has(tid)) predMap.set(tid, []);
      predMap.get(tid).push({ pred_task_id: pid, type: linkType, lagDays, lagStr });
    }
    if (pid) {
      if (!succMap.has(pid)) succMap.set(pid, []);
      succMap.get(pid).push({ succ_task_id: tid, type: linkType, lagDays, lagStr });
    }
  });

  // 5. RESOURCES (RSRC & TASKRSRC)
  const rsrcRows = tables.get('RSRC') || [];
  const rsrcMap = new Map();
  rsrcRows.forEach((r) => {
    if (r.rsrc_id) {
      rsrcMap.set(r.rsrc_id, {
        id: r.rsrc_id,
        name: r.rsrc_name || r.rsrc_short_name || `R-${r.rsrc_id}`,
        shortName: r.rsrc_short_name || '',
        type: r.rsrc_type || 'RT_Labor',
        unit: r.unit_id || 'hr'
      });
    }
  });

  const taskRsrcRows = tables.get('TASKRSRC') || [];
  const taskRsrcMap = new Map();
  taskRsrcRows.forEach((tr) => {
    const tid = tr.task_id;
    if (tid) {
      if (!taskRsrcMap.has(tid)) taskRsrcMap.set(tid, []);
      const rDetail = rsrcMap.get(tr.rsrc_id) || {};
      taskRsrcMap.get(tid).push({
        rsrc_id: tr.rsrc_id,
        name: rDetail.name || tr.rsrc_id,
        shortName: rDetail.shortName || '',
        cost: parseFloat(tr.cost_qty || tr.target_cost || '0'),
        targetQty: parseFloat(tr.target_qty || '0'),
        actQty: parseFloat(tr.act_qty || '0')
      });
    }
  });

  // Fast task lookup for predecessor code resolution
  const rawTasks = tables.get('TASK') || [];
  const taskIdToCodeMap = new Map();
  rawTasks.forEach((t) => {
    taskIdToCodeMap.set(t.task_id, t.task_code || t.task_id);
  });

  // 6. PROCESS TASKS
  let criticalCount = 0;
  let completedCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;
  let milestoneCount = 0;
  let minStart = null;
  let maxFinish = null;

  const tasks = rawTasks.map((t, idx) => {
    const wbsObj = wbsMap.get(t.wbs_id);
    if (wbsObj) {
      wbsObj.taskCount += 1;
    }

    // Dates
    const startDate = t.target_start_date || t.act_start_date || t.early_start_date || '';
    const finishDate = t.target_end_date || t.act_end_date || t.early_end_date || '';
    const actualStart = t.act_start_date || '';
    const actualFinish = t.act_end_date || '';
    const earlyStart = t.early_start_date || '';
    const earlyFinish = t.early_end_date || '';
    const lateStart = t.late_start_date || '';
    const lateFinish = t.late_end_date || '';

    // Duration & Float in Days (P6 exports in hours; 8 hr = 1 day)
    const targetHours = parseFloat(t.target_drtn_hr_cnt || '0');
    const remainHours = parseFloat(t.remain_drtn_hr_cnt || '0');
    const totalFloatHours = t.total_float_hr_cnt !== '' ? parseFloat(t.total_float_hr_cnt) : null;
    const freeFloatHours = t.free_float_hr_cnt !== '' ? parseFloat(t.free_float_hr_cnt) : null;

    const originalDurationDays = Math.round(targetHours / 8);
    const remainDurationDays = Math.round(remainHours / 8);
    const totalFloatDays = totalFloatHours !== null ? Math.round(totalFloatHours / 8) : null;
    const freeFloatDays = freeFloatHours !== null ? Math.round(freeFloatHours / 8) : null;

    // Status & Type
    const statusCode = t.status_code || 'TK_NotStart';
    const isCompleted = statusCode === 'TK_Complete';
    const isInProgress = statusCode === 'TK_Active';

    if (isCompleted) {
      completedCount++;
      if (wbsObj) wbsObj.completedTaskCount += 1;
    } else if (isInProgress) {
      inProgressCount++;
    } else {
      notStartedCount++;
    }

    const taskType = (t.task_type || 'TT_Task').replace('TT_', '');
    const isMilestone = taskType === 'Mile' || taskType === 'FinMile';
    if (isMilestone) milestoneCount++;

    const isCritical = t.critical_flag === 'Y' || (totalFloatDays !== null && totalFloatDays <= 0 && !isCompleted);
    if (isCritical) criticalCount++;

    const percentComplete = parseFloat(t.phys_complete_pct || '0');

    // Predecessors formatted string
    const preds = (predMap.get(t.task_id) || []).map((p) => {
      const pCode = taskIdToCodeMap.get(p.pred_task_id) || p.pred_task_id;
      return `${pCode} [${p.type}${p.lagStr}]`;
    });

    // Successors formatted string
    const succs = (succMap.get(t.task_id) || []).map((s) => {
      const sCode = taskIdToCodeMap.get(s.succ_task_id) || s.succ_task_id;
      return `${sCode} [${s.type}${s.lagStr}]`;
    });

    // Resource names
    const assignedResources = taskRsrcMap.get(t.task_id) || [];
    const resourceNames = assignedResources.map((r) => r.name).join(', ');

    // Earliest / Latest Bounds for Project
    const sDateObj = startDate ? new Date(startDate) : null;
    const fDateObj = finishDate ? new Date(finishDate) : null;
    if (sDateObj && !isNaN(sDateObj.getTime())) {
      if (!minStart || sDateObj < minStart) minStart = sDateObj;
    }
    if (fDateObj && !isNaN(fDateObj.getTime())) {
      if (!maxFinish || fDateObj > maxFinish) maxFinish = fDateObj;
    }

    return {
      id: t.task_id || `task_${idx}`,
      code: t.task_code || `A${1000 + idx * 10}`,
      name: t.task_name || `Activity ${idx + 1}`,
      wbsId: t.wbs_id,
      wbsCode: wbsObj ? wbsObj.code : '',
      wbsName: wbsObj ? wbsObj.name : '',
      wbsPath: wbsObj ? wbsObj.fullPath : '',
      calendarName: calendarMap.get(t.clndr_id) || '',
      startDate: startDate ? startDate.slice(0, 10) : '',
      finishDate: finishDate ? finishDate.slice(0, 10) : '',
      actualStart: actualStart ? actualStart.slice(0, 10) : '',
      actualFinish: actualFinish ? actualFinish.slice(0, 10) : '',
      earlyStart: earlyStart ? earlyStart.slice(0, 10) : '',
      earlyFinish: earlyFinish ? earlyFinish.slice(0, 10) : '',
      lateStart: lateStart ? lateStart.slice(0, 10) : '',
      lateFinish: lateFinish ? lateFinish.slice(0, 10) : '',
      originalDurationDays,
      remainDurationDays,
      totalFloatDays,
      freeFloatDays,
      statusCode,
      statusLabel: isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Not Started',
      taskType,
      isMilestone,
      critical: isCritical,
      drivingPath: t.driving_path_flag === 'Y',
      percentComplete: isNaN(percentComplete) ? 0 : Math.min(100, Math.max(0, percentComplete)),
      predecessors: preds,
      successors: succs,
      predecessorsCount: preds.length,
      successorsCount: succs.length,
      resources: assignedResources,
      resourceNames
    };
  });

  return {
    tables,
    tasks,
    wbsList,
    wbsTree,
    resources: Array.from(rsrcMap.values()),
    project,
    calendars: Array.from(calendarMap.entries()).map(([id, name]) => ({ id, name })),
    metrics: {
      totalTasks: tasks.length,
      criticalTasks: criticalCount,
      completedTasks: completedCount,
      inProgressTasks: inProgressCount,
      notStartedTasks: notStartedCount,
      milestones: milestoneCount,
      earliestStart: minStart ? minStart.toISOString().slice(0, 10) : null,
      latestFinish: maxFinish ? maxFinish.toISOString().slice(0, 10) : null
    }
  };
}

export function parseXer(xerText) {
  if (!xerText || typeof xerText !== 'string') {
    return assembleXerModel(new Map());
  }

  const lines = xerText.split(/\r?\n/);
  const tables = new Map();
  let currentTable = null;
  let currentFields = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;

    if (rawLine.startsWith('%T')) {
      const parts = rawLine.trim().split(/\s+/);
      currentTable = parts[1];
      if (currentTable) {
        tables.set(currentTable, []);
      }
      currentFields = [];
    } else if (rawLine.startsWith('%F') && currentTable) {
      currentFields = rawLine.substring(3).split('\t').map((f) => f.trim());
    } else if (rawLine.startsWith('%R') && currentTable) {
      const vals = rawLine.substring(3).split('\t');
      const row = {};
      for (let fIdx = 0; fIdx < currentFields.length; fIdx++) {
        row[currentFields[fIdx]] = vals[fIdx] !== undefined ? vals[fIdx] : '';
      }
      tables.get(currentTable).push(row);
    }
  }

  return assembleXerModel(tables);
}

/**
 * Asynchronous chunked parser with progress reporting
 * Yields every chunkSize lines to keep UI thread 100% responsive on 20MB+ files.
 */
export async function parseXerAsync(xerText, onProgress, chunkSize = 4000) {
  if (!xerText || typeof xerText !== 'string') {
    return assembleXerModel(new Map());
  }

  const lines = xerText.split(/\r?\n/);
  const totalLines = lines.length;
  const tables = new Map();
  let currentTable = null;
  let currentFields = [];

  for (let i = 0; i < totalLines; i++) {
    const rawLine = lines[i];

    if (rawLine) {
      if (rawLine.startsWith('%T')) {
        const parts = rawLine.trim().split(/\s+/);
        currentTable = parts[1];
        if (currentTable) {
          tables.set(currentTable, []);
        }
        currentFields = [];
      } else if (rawLine.startsWith('%F') && currentTable) {
        currentFields = rawLine.substring(3).split('\t').map((f) => f.trim());
      } else if (rawLine.startsWith('%R') && currentTable) {
        const vals = rawLine.substring(3).split('\t');
        const row = {};
        for (let fIdx = 0; fIdx < currentFields.length; fIdx++) {
          row[currentFields[fIdx]] = vals[fIdx] !== undefined ? vals[fIdx] : '';
        }
        tables.get(currentTable).push(row);
      }
    }

    // Yield every chunkSize lines
    if (i % chunkSize === 0 && i > 0) {
      if (onProgress) {
        onProgress({
          percent: Math.min(95, Math.round((i / totalLines) * 90)),
          currentTable: currentTable || 'Header',
          processedLines: i,
          totalLines
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (onProgress) {
    onProgress({
      percent: 98,
      currentTable: 'Assembling Relational Logic',
      processedLines: totalLines,
      totalLines
    });
  }

  const model = assembleXerModel(tables);

  if (onProgress) {
    onProgress({
      percent: 100,
      currentTable: 'Complete',
      processedLines: totalLines,
      totalLines
    });
  }

  return model;
}
