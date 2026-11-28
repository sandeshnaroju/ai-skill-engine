/**
 * bcfParser.js
 * Parses normalized BCF (.bcf / .bcfzip) JSON payloads and provides CSV/JSON export helpers.
 */

export function isBcfPayload(rawContent, filename = '') {
  if (/\.(bcf|bcfzip)$/i.test(filename || '')) return true;
  if (!rawContent || typeof rawContent !== 'string') return false;
  const trimmed = rawContent.trim();
  if (!trimmed.startsWith('{')) return false;
  return trimmed.includes('"format":"bcf"') || trimmed.includes('"format": "bcf"');
}

function computeStats(topics) {
  const byStatus = {};
  const byPriority = {};
  const byType = {};
  const byAssignee = {};
  let openCount = 0;
  let inProgressCount = 0;
  let closedCount = 0;
  let unassignedCount = 0;
  let overdueCount = 0;
  let totalComments = 0;
  let totalViewpoints = 0;

  for (const t of topics) {
    const st = t.topicStatus || 'Open';
    const pr = t.priority || 'Normal';
    const tp = t.topicType || 'Issue';
    const asg = t.assignedTo || 'Unassigned';

    byStatus[st] = (byStatus[st] || 0) + 1;
    byPriority[pr] = (byPriority[pr] || 0) + 1;
    byType[tp] = (byType[tp] || 0) + 1;
    byAssignee[asg] = (byAssignee[asg] || 0) + 1;

    const stL = st.toLowerCase();
    if (stL.includes('closed') || stL.includes('resolved') || stL.includes('done') || stL.includes('complete')) {
      closedCount++;
    } else if (stL.includes('progress') || stL.includes('review') || stL.includes('active') || stL.includes('pending')) {
      inProgressCount++;
    } else {
      openCount++;
    }

    if (!t.assignedTo) unassignedCount++;
    if (t.isOverdue) overdueCount++;
    totalComments += (t.comments || []).length;
    totalViewpoints += (t.viewpoints || []).length;
  }

  return {
    totalTopics: topics.length,
    openCount,
    inProgressCount,
    closedCount,
    unassignedCount,
    overdueCount,
    totalComments,
    totalViewpoints,
    byStatus,
    byPriority,
    byType,
    byAssignee,
  };
}

export function parseBcfContent(rawContent, filename = 'coordination.bcfzip') {
  const empty = {
    format: 'bcf',
    filename,
    version: '2.1',
    project: { projectId: '', name: filename.replace(/\.(bcfzip|bcf)$/i, '') },
    topics: [],
    stats: computeStats([]),
    error: null,
  };

  if (!rawContent || typeof rawContent !== 'string') {
    return { ...empty, error: 'No BCF content available.' };
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (!parsed || typeof parsed !== 'object') {
      return { ...empty, error: 'Invalid BCF JSON structure.' };
    }
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    const stats = parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : computeStats(topics);
    return {
      format: 'bcf',
      filename: parsed.filename || filename,
      version: parsed.version || '2.1',
      project: parsed.project || empty.project,
      topics,
      stats,
      error: null,
    };
  } catch (err) {
    return { ...empty, error: `Failed to parse BCF payload: ${err.message}` };
  }
}

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportBcfCsv(topics, filename = 'bcf_issue_register.csv') {
  const headers = [
    'Index',
    'GUID',
    'Title',
    'Type',
    'Status',
    'Priority',
    'Assignee',
    'Stage',
    'Due Date',
    'Overdue',
    'Comments',
    'Viewpoints',
    'Selected IFC GUIDs',
    'Created By',
    'Created Date',
    'Labels',
    'Description',
  ];

  const rows = topics.map((t) => {
    const ifcGuids = Array.from(
      new Set(
        (t.viewpoints || []).flatMap((vp) => [
          ...(vp.selection || []).map((s) => s.ifcGuid).filter(Boolean),
          ...(vp.exceptions || []).map((e) => e.ifcGuid).filter(Boolean),
        ])
      )
    );
    return [
      t.index ?? '',
      t.guid || '',
      t.title || '',
      t.topicType || '',
      t.topicStatus || '',
      t.priority || '',
      t.assignedTo || 'Unassigned',
      t.stage || '',
      t.dueDate || '',
      t.isOverdue ? 'Yes' : 'No',
      (t.comments || []).length,
      (t.viewpoints || []).length,
      ifcGuids.join('; '),
      t.creationAuthor || '',
      t.creationDate || '',
      (t.labels || []).join('; '),
      t.description || '',
    ].map(csvEscape).join(',');
  });

  const csv = [headers.map(csvEscape).join(','), ...rows].join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

export function exportBcfJson(model, filename = 'bcf_report.json') {
  const clean = {
    project: model.project,
    version: model.version,
    stats: model.stats,
    topics: model.topics,
  };
  triggerDownload(
    new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json;charset=utf-8;' }),
    filename
  );
}
