/**
 * mspXmlParser.js
 * Parses Microsoft Project XML (MSPDI) files into the same relational tables
 * consumed by assembleXerModel(), unlocking Gantt, Lookahead, IWP Packs,
 * Cost & EVM, Workforce Load, WBS, and Resources with zero UI duplication.
 */

import { assembleXerModel } from './xerParser';

export function isMspProjectXml(text) {
  if (!text || typeof text !== 'string') return false;
  const sample = text.slice(0, 8000);
  return (
    /<Project\b/i.test(sample) &&
    (/<Tasks\b/i.test(sample) || /schemas\.microsoft\.com\/project/i.test(sample))
  );
}

function parseIsoDurationHours(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  const days = parseFloat(m[1] || '0');
  const hrs = parseFloat(m[2] || '0');
  const mins = parseFloat(m[3] || '0');
  return days * 8 + hrs + mins / 60;
}

function getTagText(el, tagName, fallback = '') {
  if (!el) return fallback;
  const child = el.getElementsByTagName(tagName)[0];
  return child ? (child.textContent || '').trim() : fallback;
}

function formatP6Date(isoStr) {
  if (!isoStr) return '';
  return isoStr.replace('T', ' ').slice(0, 19);
}

export function parseMspXml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') {
    return assembleXerModel(new Map());
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const projEl = doc.getElementsByTagName('Project')[0];
  if (!projEl) return assembleXerModel(new Map());

  const tables = new Map();

  // 1. PROJECT
  const projName = getTagText(projEl, 'Name') || getTagText(projEl, 'Title') || 'MS Project Schedule';
  const startDate = formatP6Date(getTagText(projEl, 'StartDate'));
  const finishDate = formatP6Date(getTagText(projEl, 'FinishDate'));
  const statusDate = formatP6Date(getTagText(projEl, 'StatusDate') || getTagText(projEl, 'CurrentDate'));

  tables.set('PROJECT', [
    {
      proj_id: 'MSP_1',
      proj_short_name: projName,
      plan_start_date: startDate,
      plan_end_date: finishDate,
      last_recalc_date: statusDate || startDate,
    },
  ]);

  tables.set('CALENDAR', [{ clndr_id: '1', clndr_name: 'Standard (MSP)' }]);

  // 2. RESOURCES
  const rsrcRows = [];
  const rsrcParent = projEl.getElementsByTagName('Resources')[0];
  if (rsrcParent) {
    const rNodes = rsrcParent.getElementsByTagName('Resource');
    for (let i = 0; i < rNodes.length; i++) {
      const r = rNodes[i];
      const uid = getTagText(r, 'UID');
      const name = getTagText(r, 'Name');
      if (!uid || uid === '0' || !name) continue;
      const rTypeNum = getTagText(r, 'Type', '1');
      const rType = rTypeNum === '0' ? 'RT_Mat' : rTypeNum === '2' ? 'RT_Equip' : 'RT_Labor';
      rsrcRows.push({
        rsrc_id: uid,
        rsrc_name: name,
        rsrc_short_name: getTagText(r, 'Initials') || name.slice(0, 8),
        rsrc_type: rType,
        unit_id: 'hr',
      });
    }
  }
  tables.set('RSRC', rsrcRows);

  // 3. TASKS & SUMMARY WBS HIERARCHY
  const wbsRows = [];
  const taskRows = [];
  const predRows = [];
  const outlineStack = []; // [{ level, wbs_id }]

  const tasksParent = projEl.getElementsByTagName('Tasks')[0];
  if (tasksParent) {
    const tNodes = tasksParent.getElementsByTagName('Task');
    for (let i = 0; i < tNodes.length; i++) {
      const t = tNodes[i];
      const uid = getTagText(t, 'UID');
      const name = getTagText(t, 'Name');
      if (!uid || !name) continue;

      const outlineLevel = parseInt(getTagText(t, 'OutlineLevel', '1'), 10) || 1;
      const isSummary = getTagText(t, 'Summary') === '1' || uid === '0';
      const wbsCode = getTagText(t, 'WBS') || getTagText(t, 'OutlineNumber') || uid;

      while (outlineStack.length > 0 && outlineStack[outlineStack.length - 1].level >= outlineLevel) {
        outlineStack.pop();
      }
      const parentWbsId = outlineStack.length > 0 ? outlineStack[outlineStack.length - 1].wbs_id : '';

      if (isSummary) {
        const wbsId = `WBS_${uid}`;
        wbsRows.push({
          wbs_id: wbsId,
          parent_wbs_id: parentWbsId,
          wbs_short_name: wbsCode,
          wbs_name: name,
          status_code: 'WS_Open',
        });
        outlineStack.push({ level: outlineLevel, wbs_id: wbsId });
        continue;
      }

      const assignedWbsId = parentWbsId || 'WBS_0';
      const pct =
        parseFloat(getTagText(t, 'PhysicalPercentComplete') || getTagText(t, 'PercentComplete', '0')) || 0;
      const statusCode = pct >= 100 ? 'TK_Complete' : pct > 0 ? 'TK_Active' : 'TK_NotStart';

      const durHrs = parseIsoDurationHours(getTagText(t, 'Duration'));
      const remHrs = parseIsoDurationHours(getTagText(t, 'RemainingDuration'));
      const totalSlackTenthsMin = parseFloat(getTagText(t, 'TotalSlack', '0')) || 0;
      const totalFloatHrs = totalSlackTenthsMin / 600;
      const isCritical = getTagText(t, 'Critical') === '1' || totalFloatHrs <= 0;
      const isMile = getTagText(t, 'Milestone') === '1';

      taskRows.push({
        task_id: uid,
        task_code: getTagText(t, 'ID') || wbsCode || uid,
        task_name: name,
        wbs_id: assignedWbsId,
        target_start_date: formatP6Date(getTagText(t, 'Start')),
        target_end_date: formatP6Date(getTagText(t, 'Finish')),
        act_start_date: formatP6Date(getTagText(t, 'ActualStart')),
        act_end_date: formatP6Date(getTagText(t, 'ActualFinish')),
        early_start_date: formatP6Date(getTagText(t, 'EarlyStart')),
        early_end_date: formatP6Date(getTagText(t, 'EarlyFinish')),
        late_start_date: formatP6Date(getTagText(t, 'LateStart')),
        late_end_date: formatP6Date(getTagText(t, 'LateFinish')),
        target_drtn_hr_cnt: String(durHrs),
        remain_drtn_hr_cnt: String(remHrs),
        total_float_hr_cnt: String(totalFloatHrs),
        free_float_hr_cnt: String((parseFloat(getTagText(t, 'FreeSlack', '0')) || 0) / 600),
        status_code: statusCode,
        task_type: isMile ? 'TT_Mile' : 'TT_Task',
        critical_flag: isCritical ? 'Y' : 'N',
        phys_complete_pct: String(pct),
      });

      const predLinks = t.getElementsByTagName('PredecessorLink');
      const linkTypeMap = { '0': 'PR_FF', '1': 'PR_FS', '2': 'PR_SF', '3': 'PR_SS' };
      for (let p = 0; p < predLinks.length; p++) {
        const pl = predLinks[p];
        const predUid = getTagText(pl, 'PredecessorUID');
        if (!predUid) continue;
        const pType = linkTypeMap[getTagText(pl, 'Type', '1')] || 'PR_FS';
        const lagTenthsMin = parseFloat(getTagText(pl, 'LinkLag', '0')) || 0;
        predRows.push({
          task_id: uid,
          pred_task_id: predUid,
          pred_type: pType,
          lag_hr_cnt: String(lagTenthsMin / 600),
        });
      }
    }
  }

  if (wbsRows.length === 0) {
    wbsRows.push({ wbs_id: 'WBS_0', parent_wbs_id: '', wbs_short_name: 'ROOT', wbs_name: projName, status_code: 'WS_Open' });
  }
  tables.set('PROJWBS', wbsRows);
  tables.set('TASK', taskRows);
  tables.set('TASKPRED', predRows);

  // 4. ASSIGNMENTS (TASKRSRC)
  const taskRsrcRows = [];
  const assignParent = projEl.getElementsByTagName('Assignments')[0];
  if (assignParent) {
    const aNodes = assignParent.getElementsByTagName('Assignment');
    for (let i = 0; i < aNodes.length; i++) {
      const a = aNodes[i];
      const tid = getTagText(a, 'TaskUID');
      const rid = getTagText(a, 'ResourceUID');
      if (!tid || !rid || rid === '-65535') continue;

      const workHrs = parseIsoDurationHours(getTagText(a, 'Work'));
      const actHrs = parseIsoDurationHours(getTagText(a, 'ActualWork'));
      const remHrs = parseIsoDurationHours(getTagText(a, 'RemainingWork'));
      const cost = parseFloat(getTagText(a, 'Cost', '0')) || 0;
      const actCost = parseFloat(getTagText(a, 'ActualCost', '0')) || 0;

      taskRsrcRows.push({
        task_id: tid,
        rsrc_id: rid,
        target_qty: String(workHrs),
        act_reg_qty: String(actHrs),
        act_ot_qty: '0',
        remain_qty: String(remHrs),
        target_cost: String(cost),
        act_reg_cost: String(actCost),
        act_ot_cost: '0',
        cost_qty: String(cost),
      });
    }
  }
  tables.set('TASKRSRC', taskRsrcRows);

  const model = assembleXerModel(tables);
  return { ...model, sourceFormat: 'msp_xml' };
}
