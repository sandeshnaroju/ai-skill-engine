/**
 * lookaheadEngine.js
 * 
 * Slices master schedule into tactical 21-day / 3-week field work packages.
 * Implements AWP / Last Planner System Make-Ready constraint tracking:
 * 6 Pillars: Material (M), Labor (L), Equipment (E), Drawings (D), Permits (P), Access (A).
 */

export const CONSTRAINT_TYPES = [
  { key: 'material', label: 'Material', short: 'M', icon: '📦', desc: 'Materials fabricated, delivered & verified at laydown' },
  { key: 'labor', label: 'Labor / Crew', short: 'L', icon: '👷', desc: 'Subcontractor crew mobilized with required skillsets' },
  { key: 'equipment', label: 'Equipment', short: 'E', icon: '🚜', desc: 'Cranes, scaffolding, machinery & tools available' },
  { key: 'drawings', label: 'Drawings / RFI', short: 'D', icon: '📐', desc: 'Approved IFC drawings & answered technical RFIs' },
  { key: 'permits', label: 'Permit / Safety', short: 'P', icon: '📋', desc: 'Hot work, confined space & environmental permits active' },
  { key: 'access', label: 'Workfront Access', short: 'A', icon: '🔑', desc: 'Preceding trades handed over clean work area' },
];

/**
 * Format a Date to YYYY-MM-DD local string
 */
export function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD or standard date string safely
 */
export function parseDateSafe(str) {
  if (!str) return null;
  // If string contains time (e.g. 2024-03-14 08:00), extract date portion
  const cleanStr = String(str).trim().split(' ')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d);
  }
  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Generate array of days for the lookahead horizon (default: 21 days)
 */
export function generateLookaheadDays(anchorDateStr, horizonDays = 21) {
  let baseDate = parseDateSafe(anchorDateStr) || new Date();
  
  // Snap to Monday of the anchor date's week for standard construction weekly work planning
  const dayOfWeek = baseDate.getDay(); // 0 is Sun, 1 is Mon...
  const distanceToMonday = (dayOfWeek + 6) % 7;
  const startMonday = new Date(baseDate);
  startMonday.setDate(baseDate.getDate() - distanceToMonday);

  const days = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < horizonDays; i++) {
    const cur = new Date(startMonday);
    cur.setDate(startMonday.getDate() + i);

    const dStr = formatDate(cur);
    const dow = cur.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const weekIndex = Math.floor(i / 7) + 1; // 1, 2, 3...

    days.push({
      dateStr: dStr,
      dateObj: cur,
      dayName: dayNames[dow],
      dayNum: cur.getDate(),
      monthName: monthNames[cur.getMonth()],
      isWeekend,
      weekIndex,
      weekLabel: `Week ${weekIndex}`
    });
  }

  return days;
}

/**
 * Check if a task intersects the lookahead window
 */
export function isTaskInLookahead(task, windowStartStr, windowEndStr) {
  if (!task.startDate || !task.finishDate) return false;
  const tStart = String(task.startDate).split(' ')[0];
  const tFinish = String(task.finishDate).split(' ')[0];

  // Intersects if: taskStart <= windowEnd && taskFinish >= windowStart
  return tStart <= windowEndStr && tFinish >= windowStartStr;
}

/**
 * Calculate per-day working status for a task across all window days
 */
export function calculateTaskDailyProfile(task, days) {
  const tStart = String(task.startDate || '').split(' ')[0];
  const tFinish = String(task.finishDate || '').split(' ')[0];

  return days.map(day => {
    const inRange = day.dateStr >= tStart && day.dateStr <= tFinish;
    const isStartDay = day.dateStr === tStart;
    const isFinishDay = day.dateStr === tFinish;
    const isWorking = inRange && !day.isWeekend;

    return {
      dateStr: day.dateStr,
      inRange,
      isStartDay,
      isFinishDay,
      isWorking,
      isWeekend: day.isWeekend
    };
  });
}

/**
 * Group days array into weekly summaries (W1, W2, ... W6, W12)
 */
export function generateLookaheadWeeks(days) {
  const weeks = [];
  const totalWeeks = Math.ceil(days.length / 7);
  for (let w = 1; w <= totalWeeks; w++) {
    const weekDays = days.filter(d => d.weekIndex === w);
    if (!weekDays.length) continue;
    const startDay = weekDays[0];
    const endDay = weekDays[weekDays.length - 1];
    weeks.push({
      weekIndex: w,
      label: `W${w}`,
      fullLabel: `Week ${w}`,
      dateRangeStr: `${startDay.monthName} ${startDay.dayNum} – ${endDay.monthName} ${endDay.dayNum}`,
      startStr: startDay.dateStr,
      endStr: endDay.dateStr,
      days: weekDays
    });
  }
  return weeks;
}

/**
 * Calculate per-week working profile for a task (ideal for 6WL and 12WL condensed view)
 */
export function calculateTaskWeeklyProfile(task, weeks) {
  const tStart = String(task.startDate || '').split(' ')[0];
  const tFinish = String(task.finishDate || '').split(' ')[0];

  return weeks.map(week => {
    // Intersects week if taskStart <= weekEnd && taskFinish >= weekStart
    const inRange = tStart <= week.endStr && tFinish >= week.startStr;
    const isStartWeek = tStart >= week.startStr && tStart <= week.endStr;
    const isFinishWeek = tFinish >= week.startStr && tFinish <= week.endStr;

    // Count how many working days in this week fall within the task
    const workingDaysCount = week.days.filter(d =>
      !d.isWeekend && d.dateStr >= tStart && d.dateStr <= tFinish
    ).length;

    return {
      weekIndex: week.weekIndex,
      inRange,
      isStartWeek,
      isFinishWeek,
      workingDaysCount,
      totalWorkingDays: week.days.filter(d => !d.isWeekend).length
    };
  });
}

/**
 * Initialize default constraint states for a task
 */
export function initTaskConstraints(task) {
  // If task is completed
  if (task.statusCode === 'TK_Complete') {
    return {
      material: 'ready',
      labor: 'ready',
      equipment: 'ready',
      drawings: 'ready',
      permits: 'ready',
      access: 'ready',
      notes: ''
    };
  }

  // If task is active in progress
  if (task.statusCode === 'TK_Active') {
    return {
      material: 'ready',
      labor: 'ready',
      equipment: 'ready',
      drawings: 'ready',
      permits: 'ready',
      access: 'ready',
      notes: ''
    };
  }

  // If task has not started yet
  return {
    material: task.critical ? 'pending' : 'ready',
    labor: 'pending',
    equipment: 'ready',
    drawings: 'ready',
    permits: 'ready',
    access: (task.predecessors && task.predecessors.length > 0) ? 'pending' : 'ready',
    notes: ''
  };
}

/**
 * Evaluate task readiness given its constraints
 * Returns: 'READY' (all green) | 'BLOCKED' (any red) | 'PENDING' (any yellow)
 */
export function evaluateTaskReadiness(constraints) {
  if (!constraints) return 'READY';
  const values = [
    constraints.material,
    constraints.labor,
    constraints.equipment,
    constraints.drawings,
    constraints.permits,
    constraints.access
  ];

  if (values.includes('blocked')) return 'BLOCKED';
  if (values.includes('pending')) return 'PENDING';
  return 'READY';
}

/**
 * Export 3WL to standard CSV for field trailers & trade coordination
 */
export function exportLookaheadToCsv(tasksWithProfile, days, filename = 'Lookahead_Report', isWeeklyMode = false, weeks = []) {
  if (!tasksWithProfile || !tasksWithProfile.length) return;

  // Header row 1: Metadata
  const timelineHeaders = isWeeklyMode && weeks.length > 0
    ? weeks.map(w => `${w.fullLabel} (${w.dateRangeStr})`)
    : days.map(d => `${d.dayName} ${d.monthName} ${d.dayNum}`);

  const headerCols = [
    'Activity ID',
    'Activity Name',
    'Trade / Subcontractor',
    'WBS Zone',
    'Status',
    'Critical',
    'Rem Dur (d)',
    'Start Date',
    'Finish Date',
    'Readiness',
    'Material (M)',
    'Labor (L)',
    'Equipment (E)',
    'Drawings (D)',
    'Permits (P)',
    'Access (A)',
    'Field Notes',
    ...timelineHeaders
  ];

  const rows = tasksWithProfile.map(item => {
    const t = item.task;
    const c = item.constraints;
    const readiness = item.readiness;
    
    let timelineCells = [];
    if (isWeeklyMode && item.weeklyProfile) {
      timelineCells = item.weeklyProfile.map(w => {
        if (!w.inRange) return '';
        if (w.workingDaysCount > 0) return `${w.workingDaysCount}d`;
        return 'ACTIVE';
      });
    } else {
      timelineCells = item.dailyProfile.map(p => {
        if (p.isWeekend) return 'WE';
        if (p.isStartDay && p.isFinishDay) return 'S/F';
        if (p.isStartDay) return 'START';
        if (p.isFinishDay) return 'FINISH';
        if (p.inRange) return 'WORK';
        return '';
      });
    }

    const colValues = [
      t.code,
      `"${String(t.name || '').replace(/"/g, '""')}"`,
      `"${String(t.resourceNames || 'Unassigned').replace(/"/g, '""')}"`,
      `"${String(t.wbsName || t.wbsCode || '').replace(/"/g, '""')}"`,
      t.statusLabel,
      t.critical ? 'CRITICAL' : 'Normal',
      t.remainDurationDays !== null ? `${t.remainDurationDays}d` : '',
      t.startDate,
      t.finishDate,
      readiness,
      c.material,
      c.labor,
      c.equipment,
      c.drawings,
      c.permits,
      c.access,
      `"${String(c.notes || '').replace(/"/g, '""')}"`,
      ...timelineCells
    ];

    return colValues.join(',');
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + [headerCols.join(','), ...rows].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
