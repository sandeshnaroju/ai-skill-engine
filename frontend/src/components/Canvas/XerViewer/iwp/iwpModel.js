/**
 * IWP (Installation Work Package) Data Model & Engine
 * Open Industry Standards: Construction Industry Institute (CII) & COAA Advanced Work Packaging (AWP)
 * WorkFace Planning (WFP) & Last Planner System (LPS) Make-Ready Constraints
 */

export const IWP_STATUSES = {
  planning: {
    id: 'planning',
    label: 'Planning & Scoping',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)',
    description: 'WorkFace planner defining scope, bundling activities and linking drawings.'
  },
  constraint_review: {
    id: 'constraint_review',
    label: 'Constraint Review',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    description: 'Field superintendents and discipline coordinators clearing the 6 Make-Ready pillars.'
  },
  ready_for_release: {
    id: 'ready_for_release',
    label: 'Ready for Release',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.3)',
    description: 'All 6 Make-Ready constraint pillars verified 100% green. Approved for field execution.'
  },
  active: {
    id: 'active',
    label: 'Active on Site',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.3)',
    description: 'Dispatched to craft crew. Time-on-tools execution and daily logs active.'
  },
  closed: {
    id: 'closed',
    label: 'Closed & Turnover',
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.12)',
    border: 'rgba(107, 114, 128, 0.3)',
    description: 'Work completed, ITP QA/QC sign-offs verified, package archived.'
  }
};

export const CONSTRAINT_PILLARS = {
  material: {
    code: 'M',
    name: 'Material & BOM',
    description: 'BOM staged in laydown yard, tagged spools/valves physically verified.'
  },
  labor: {
    code: 'L',
    name: 'Labor & Qualifications',
    description: 'Qualified craft crew assigned, badges and trade certifications current.'
  },
  equipment: {
    code: 'E',
    name: 'Equipment & Rigging',
    description: 'Cranes, lifts, scaffolding, and calibrated torque tools scheduled.'
  },
  drawings: {
    code: 'D',
    name: 'Drawings & Isometrics',
    description: 'Approved-for-Construction (IFC) drawings and spool cut sheets confirmed at current revision.'
  },
  permits: {
    code: 'P',
    name: 'Permits & Safety',
    description: 'Active Hot Work, Confined Space, or Excavation permits issued; JHA reviewed.'
  },
  access: {
    code: 'A',
    name: 'Access & Preceding Work',
    description: 'Preceding civil/structural work completed, scaffold green-tagged, area clean.'
  }
};

/**
 * Gatekeeper check: An IWP CANNOT enter "Ready for Release" or "Active on Site"
 * unless all 6 Make-Ready constraint pillars are verified "cleared".
 */
export function canReleaseToField(iwp) {
  if (!iwp || !iwp.constraints) {
    return { canRelease: false, blockers: ['Missing constraint definitions'] };
  }
  const blockers = [];
  const pillarKeys = Object.keys(CONSTRAINT_PILLARS);

  for (const pillar of pillarKeys) {
    const item = iwp.constraints[pillar];
    if (!item || item.status !== 'cleared') {
      const statusLabel = item ? item.status : 'undefined';
      blockers.push(`${CONSTRAINT_PILLARS[pillar].name} (${CONSTRAINT_PILLARS[pillar].code}) is ${statusLabel}`);
    }
  }

  return {
    canRelease: blockers.length === 0,
    blockers,
    clearedCount: pillarKeys.length - blockers.length,
    totalCount: pillarKeys.length
  };
}

/**
 * Factory function to create a new IWP from selected schedule activities
 */
export function createIwpFromTasks(tasks = [], projectMeta = {}, custom = {}) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const discipline = custom.discipline || 'Piping';
  const discCode = discipline.slice(0, 3).toUpperCase();
  const iwpId = custom.iwpId || `IWP-${discCode}-${randomSuffix}`;

  // Aggregate start/finish dates
  let minStart = null;
  let maxFinish = null;
  let totalHours = 0;

  tasks.forEach(t => {
    const s = t.earlyStartDate || t.startDate;
    const f = t.earlyEndDate || t.endDate;
    if (s && (!minStart || s < minStart)) minStart = s;
    if (f && (!maxFinish || f > maxFinish)) maxFinish = f;
    totalHours += Number(t.targetWorkQty || t.remainingDurationDays * 8 || 40);
  });

  return {
    $schema: 'https://standards.awp.org/schema/v1/iwp.json',
    formatVersion: '1.0',
    iwpId,
    cwpRef: custom.cwpRef || `CWP-${projectMeta.shortCode || 'GEN'}-${discCode}-01`,
    title: custom.title || `${discipline} Installation Package - ${tasks.length} Activities`,
    discipline,
    area: custom.area || 'Module 100 - Area A',
    status: 'planning', // planning -> constraint_review -> ready_for_release -> active -> closed
    projectCode: projectMeta.shortCode || projectMeta.projectName || 'PROJECT',
    createdAt: dateStr,
    updatedAt: dateStr,
    schedule: {
      plannedStart: minStart ? minStart.slice(0, 10) : dateStr,
      plannedFinish: maxFinish ? maxFinish.slice(0, 10) : dateStr,
      plannedManHours: totalHours > 0 ? totalHours : 480,
      actualManHours: 0,
      crewSize: custom.crewSize || 6,
      targetCraft: custom.targetCraft || `${discipline} Crew`,
      activities: tasks.map(t => ({
        taskCode: t.activityCode || t.task_code || t.taskId,
        taskName: t.activityName || t.task_name || 'Activity',
        earlyStart: t.earlyStartDate || t.startDate || '',
        earlyFinish: t.earlyEndDate || t.endDate || '',
        durationDays: t.remainingDurationDays || t.plannedDurationDays || 5,
        plannedHours: Number(t.targetWorkQty || 40),
        status: t.status || 'Not Started'
      }))
    },
    constraints: {
      material: {
        status: 'pending',
        details: 'Verify spools and valves staged in designated laydown yard.',
        owner: 'Material Coordinator',
        targetDate: minStart ? minStart.slice(0, 10) : ''
      },
      labor: {
        status: 'cleared',
        details: 'Craft crew assigned with active certifications.',
        owner: 'Discipline Superintendent',
        targetDate: minStart ? minStart.slice(0, 10) : ''
      },
      equipment: {
        status: 'pending',
        details: 'Rigging gear and torque wrenches reserved.',
        owner: 'Rigging Lead',
        targetDate: minStart ? minStart.slice(0, 10) : ''
      },
      drawings: {
        status: 'cleared',
        details: 'IFC Revision approved and printed.',
        owner: 'Field Engineer',
        targetDate: minStart ? minStart.slice(0, 10) : ''
      },
      permits: {
        status: 'pending',
        details: 'Hot work permit application submitted to safety.',
        owner: 'HSE Coordinator',
        targetDate: minStart ? minStart.slice(0, 10) : ''
      },
      access: {
        status: 'cleared',
        details: 'Scaffolding erected and green-tagged.',
        owner: 'Scaffolding Lead',
        targetDate: minStart ? minStart.slice(0, 10) : ''
      }
    },
    bom: [
      {
        itemCode: 'SP-101',
        desc: `${discipline} Prefabricated Spool / Assembly`,
        qtyReq: 1,
        qtyStaged: 1,
        bin: 'Laydown Bay 3',
        status: 'staged'
      },
      {
        itemCode: 'FST-200',
        desc: 'Stud Bolts & Gaskets Set B7/2H',
        qtyReq: 12,
        qtyStaged: 12,
        bin: 'Bin Shelf 4A',
        status: 'staged'
      }
    ],
    tools: [
      { item: 'Calibrated Torque Wrench (150-600 ft-lb)', required: true, ready: true },
      { item: 'Chain Hoist 2-Ton (Current Load Tag)', required: true, ready: true },
      { item: 'Flange Spreader Set', required: true, ready: false }
    ],
    safetyJha: [
      {
        step: 'Material Hoisting & Positioning',
        hazard: 'Suspended load, pinch points, struck-by hazard',
        control: 'Establish exclusion zone with red barricade tape. Use tag lines on all loads.'
      },
      {
        step: 'Hot Work / Bolt Torquing',
        hazard: 'Over-torque failure, eye injuries from flying debris',
        control: 'Follow calibrated torque sequence. Wear safety goggles and cut-resistant gloves.'
      }
    ],
    qualityItp: [
      {
        stepNo: 1,
        inspection: 'Material Receiving & Spool Tag Verification',
        point: 'Review',
        signedBy: 'QC Inspector',
        signedDate: dateStr
      },
      {
        stepNo: 2,
        inspection: 'Joint Fit-Up & Alignment Verification',
        point: 'Hold',
        signedBy: null,
        signedDate: null
      },
      {
        stepNo: 3,
        inspection: 'Final Torque & Flange Gap Verification',
        point: 'Witness',
        signedBy: null,
        signedDate: null
      }
    ],
    drawings: [
      {
        drawingNo: `ISO-${discCode}-${randomSuffix}`,
        rev: '0',
        title: `${discipline} Area Piping Isometric & Spool Detail`,
        status: 'IFC'
      }
    ],
    dailyLogs: []
  };
}

/**
 * Storage helpers (project-scoped localStorage)
 */
function getStorageKey(projectCode) {
  const cleanCode = (projectCode || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `awp_iwps_${cleanCode}`;
}

export function loadProjectIwps(projectCode, projectMeta = {}) {
  try {
    const key = getStorageKey(projectCode);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load IWPs from local storage:', e);
  }

  // Provide initial starter packages if empty
  const starter1 = createIwpFromTasks(
    [
      { activityCode: 'PIP-101', activityName: 'Erect Pipe Spool SP-01', remainingDurationDays: 5, targetWorkQty: 180 },
      { activityCode: 'PIP-102', activityName: 'Bolt-up Flange Joint FJ-01', remainingDurationDays: 3, targetWorkQty: 120 }
    ],
    projectMeta,
    {
      iwpId: 'IWP-PIP-0101',
      title: 'Piping Spool Installation - Rack A',
      discipline: 'Piping',
      crewSize: 6
    }
  );
  starter1.status = 'ready_for_release';
  starter1.constraints.material.status = 'cleared';
  starter1.constraints.equipment.status = 'cleared';
  starter1.constraints.permits.status = 'cleared';

  const starter2 = createIwpFromTasks(
    [
      { activityCode: 'ELE-201', activityName: 'Cable Tray Installation B-12', remainingDurationDays: 6, targetWorkQty: 240 }
    ],
    projectMeta,
    {
      iwpId: 'IWP-ELE-0202',
      title: 'Cable Tray Routing & Bracket Mounting',
      discipline: 'Electrical',
      crewSize: 4
    }
  );
  starter2.status = 'constraint_review';

  const list = [starter1, starter2];
  saveAllProjectIwps(projectCode, list);
  return list;
}

export function saveAllProjectIwps(projectCode, iwps) {
  try {
    const key = getStorageKey(projectCode);
    localStorage.setItem(key, JSON.stringify(iwps));
  } catch (e) {
    console.error('Failed to save IWPs to local storage:', e);
  }
}

export function saveSingleIwp(projectCode, iwp) {
  const current = loadProjectIwps(projectCode);
  const idx = current.findIndex(p => p.iwpId === iwp.iwpId);
  iwp.updatedAt = new Date().toISOString().slice(0, 10);
  if (idx >= 0) {
    current[idx] = iwp;
  } else {
    current.unshift(iwp);
  }
  saveAllProjectIwps(projectCode, current);
  return current;
}

export function deleteSingleIwp(projectCode, iwpId) {
  const current = loadProjectIwps(projectCode);
  const filtered = current.filter(p => p.iwpId !== iwpId);
  saveAllProjectIwps(projectCode, filtered);
  return filtered;
}

/**
 * Export IWP as a downloadable .iwp.json file
 */
export function exportIwpJson(iwp) {
  if (!iwp) return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(iwp, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `${iwp.iwpId || 'work-package'}.iwp.json`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Validate and parse incoming .iwp or .iwp.json content string
 */
export function parseIwpContent(contentString) {
  if (!contentString || typeof contentString !== 'string') {
    throw new Error('Empty or invalid IWP content');
  }
  const data = JSON.parse(contentString.trim());
  if (!data.iwpId && !data.title) {
    throw new Error('File does not appear to be a valid IWP JSON schema');
  }
  return data;
}
