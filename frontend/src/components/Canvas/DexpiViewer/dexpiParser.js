/**
 * dexpiParser.js
 * Entry point for DEXPI P&ID parsing: dispatches DEXPI 1.x (<PlantModel>)
 * to dexpiV1Parser.js and DEXPI 2.0 (<Model>) to dexpiV2Parser.js.
 */
import { localName } from './dexpiCommon';
import { parseDexpiV1 } from './dexpiV1Parser';
import { parseDexpiV2 } from './dexpiV2Parser';

export {
  DEXPI_CATEGORY_COLORS,
  isDexpiXml,
  exportDexpiEquipmentCsv,
  exportDexpiLinesCsv,
  exportDexpiValvesCsv,
  exportDexpiInstrumentsCsv,
  exportDexpiSvg,
} from './dexpiCommon';

export function parseDexpiXml(rawContent) {
  const empty = {
    meta: { originatingSystem: '', version: '', discipline: 'Process', drawingName: 'DEXPI P&ID', drawingTitle: '' },
    yAxisUp: true,
    entities: [],
    connections: [],
    connectionsById: {},
    equipmentList: [],
    lineList: [],
    valveList: [],
    instrumentList: [],
    bounds: { minX: 0, maxX: 420, minY: 0, maxY: 297 },
    error: null,
  };

  if (!rawContent || typeof rawContent !== 'string') {
    return { ...empty, error: 'Empty DEXPI XML content.' };
  }

  const doc = new DOMParser().parseFromString(rawContent, 'application/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    return { ...empty, error: `Invalid XML: ${parseErr.textContent?.slice(0, 160) || 'Parse error'}` };
  }

  const root = doc.documentElement;
  if (root && localName(root) === 'Model') {
    return parseDexpiV2(root);
  }
  if (root && localName(root) === 'PlantModel') {
    return parseDexpiV1(root);
  }

  return { ...empty, error: 'Root element <PlantModel> (DEXPI 1.x) or <Model> (DEXPI 2.0) not found.' };
}
