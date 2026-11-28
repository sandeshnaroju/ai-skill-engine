/**
 * ifcEngine.js
 * Loads .ifc STEP-21 models using web-ifc (WASM), builds Three.js meshes with
 * per-expressID materials/transparency, extracts Spatial Hierarchy
 * (IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey -> Elements),
 * PropertySets / Quantities, GlobalId (IfcGuid) index, and CSV takeoff export.
 */
import * as THREE from 'three';

function loadWebIfcScript() {
  if (typeof window !== 'undefined' && window.WebIFC) {
    return Promise.resolve(window.WebIFC);
  }
  if (typeof window !== 'undefined' && window.__webIfcLoadPromise) {
    return window.__webIfcLoadPromise;
  }
  const p = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/wasm/web-ifc-api-iife.js';
    script.async = true;
    script.onload = () => {
      if (window.WebIFC) resolve(window.WebIFC);
      else reject(new Error('web-ifc-api-iife.js loaded but window.WebIFC is undefined.'));
    };
    script.onerror = () => reject(new Error('Failed to load /wasm/web-ifc-api-iife.js'));
    document.head.appendChild(script);
  });
  if (typeof window !== 'undefined') window.__webIfcLoadPromise = p;
  return p;
}

function extractStr(val) {
  if (val == null) return '';
  if (typeof val === 'object' && 'value' in val) return val.value == null ? '' : String(val.value);
  return String(val);
}

function getGeometryFromPlaced(ifcApi, modelID, placed) {
  const geom = ifcApi.GetGeometry(modelID, placed.geometryExpressID);
  const verts = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
  const indices = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
  geom.delete();

  const vertCount = Math.floor(verts.length / 6);
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);

  for (let i = 0; i < vertCount; i++) {
    positions[i * 3] = verts[i * 6];
    positions[i * 3 + 1] = verts[i * 6 + 1];
    positions[i * 3 + 2] = verts[i * 6 + 2];
    normals[i * 3] = verts[i * 6 + 3];
    normals[i * 3 + 1] = verts[i * 6 + 4];
    normals[i * 3 + 2] = verts[i * 6 + 5];
  }

  const buf = new THREE.BufferGeometry();
  buf.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  buf.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  buf.setIndex(new THREE.BufferAttribute(indices, 1));

  const mat4 = new THREE.Matrix4().fromArray(placed.flatTransformation);
  buf.applyMatrix4(mat4);
  return buf;
}

export async function loadIfcModel({ fullContent, mediaUrl, filename = 'model.ifc' }) {
  let buffer = null;

  if (mediaUrl) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const resp = await fetch(mediaUrl, { headers });
    if (!resp.ok) throw new Error(`Failed to fetch IFC file (${resp.status})`);
    buffer = new Uint8Array(await resp.arrayBuffer());
  } else if (fullContent && typeof fullContent === 'string' && fullContent.includes('ISO-10303-21')) {
    buffer = new TextEncoder().encode(fullContent);
  } else {
    throw new Error('No IFC file content or media URL available.');
  }

  const WebIFC = await loadWebIfcScript();
  const ifcApi = new WebIFC.IfcAPI();
  ifcApi.SetWasmPath('/wasm/', true);
  await ifcApi.Init(undefined, true);

  const modelID = ifcApi.OpenModel(buffer);
  const rootGroup = new THREE.Group();
  const meshesByExpressId = new Map();
  const materialCache = new Map();

  const getMat = (colorObj) => {
    const r = colorObj?.x ?? 0.75;
    const g = colorObj?.y ?? 0.78;
    const b = colorObj?.z ?? 0.82;
    const a = colorObj?.w ?? 1.0;
    const key = `${r.toFixed(2)}_${g.toFixed(2)}_${b.toFixed(2)}_${a.toFixed(2)}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const col = new THREE.Color(r, g, b);
    const mat = new THREE.MeshLambertMaterial({
      color: col,
      transparent: a < 0.99,
      opacity: a,
      side: THREE.DoubleSide,
    });
    materialCache.set(key, mat);
    return mat;
  };

  ifcApi.StreamAllMeshes(modelID, (ifcMesh) => {
    const eid = ifcMesh.expressID;
    const size = ifcMesh.geometries.size();
    const list = [];
    for (let i = 0; i < size; i++) {
      const placed = ifcMesh.geometries.get(i);
      const buf = getGeometryFromPlaced(ifcApi, modelID, placed);
      const mat = getMat(placed.color);
      const mesh = new THREE.Mesh(buf, mat);
      mesh.userData = { expressID: eid, baseMaterial: mat };
      rootGroup.add(mesh);
      list.push(mesh);
    }
    if (list.length) {
      meshesByExpressId.set(eid, list);
    }
  });

  // Center rootGroup at origin for clean OrbitControls & section clipping
  const box = new THREE.Box3().setFromObject(rootGroup);
  const center = new THREE.Vector3();
  const sizeVec = new THREE.Vector3();
  if (!box.isEmpty()) {
    box.getCenter(center);
    box.getSize(sizeVec);
    rootGroup.position.sub(center);
  } else {
    sizeVec.set(10, 10, 10);
  }
  const centeredBox = new THREE.Box3().setFromObject(rootGroup);

  // Extract spatial structure & element index
  let spatialTree = null;
  try {
    spatialTree = await ifcApi.properties.getSpatialStructure(modelID, true);
  } catch {
    spatialTree = null;
  }

  const elementMeta = new Map();
  const classCounts = {};
  const guidToExpressId = new Map();

  const registerElement = (eid, storeyName = '') => {
    if (elementMeta.has(eid)) {
      if (storeyName && !elementMeta.get(eid).storey) {
        elementMeta.get(eid).storey = storeyName;
      }
      return elementMeta.get(eid);
    }
    let props = null;
    try {
      props = ifcApi.GetLine(modelID, eid, false);
    } catch {
      return null;
    }
    if (!props) return null;
    const typeName = ifcApi.GetNameFromTypeCode(props.type) || `IFC_${props.type}`;
    const name = extractStr(props.Name) || extractStr(props.LongName) || typeName;
    const globalId = extractStr(props.GlobalId);
    const tag = extractStr(props.Tag);
    const info = {
      expressID: eid,
      type: typeName,
      name,
      globalId,
      tag,
      storey: storeyName,
      hasMesh: meshesByExpressId.has(eid),
    };
    elementMeta.set(eid, info);
    if (globalId) guidToExpressId.set(globalId, eid);
    if (info.hasMesh) {
      classCounts[typeName] = (classCounts[typeName] || 0) + 1;
    }
    return info;
  };

  const enrichTree = (node, currentStorey = '') => {
    if (!node) return null;
    const info = registerElement(node.expressID, currentStorey);
    const nextStorey = info?.type === 'IFCBUILDINGSTOREY' ? info.name : currentStorey;
    const children = (node.children || []).map((ch) => enrichTree(ch, nextStorey)).filter(Boolean);
    return {
      expressID: node.expressID,
      type: info?.type || node.type || 'IFC',
      name: info?.name || `#${node.expressID}`,
      globalId: info?.globalId || '',
      hasMesh: info?.hasMesh || false,
      children,
    };
  };

  const enrichedTree = spatialTree ? enrichTree(spatialTree, '') : null;

  // Register any streamed mesh expressIDs not in spatial tree
  for (const eid of meshesByExpressId.keys()) {
    registerElement(eid, '');
  }

  return {
    filename,
    ifcApi,
    modelID,
    rootGroup,
    meshesByExpressId,
    elementMeta,
    guidToExpressId,
    classCounts,
    spatialTree: enrichedTree,
    bounds: {
      minY: centeredBox.min.y,
      maxY: centeredBox.max.y,
      size: sizeVec,
      radius: Math.max(2, sizeVec.length() * 0.6),
    },
  };
}

export async function getIfcElementDetails(ifcApi, modelID, expressID) {
  if (!ifcApi || expressID == null) return null;
  let raw = null;
  try {
    raw = ifcApi.GetLine(modelID, expressID, true);
  } catch {
    return null;
  }
  if (!raw) return null;

  const typeName = ifcApi.GetNameFromTypeCode(raw.type) || `IFC_${raw.type}`;
  const propertySets = [];

  try {
    const psets = await ifcApi.properties.getPropertySets(modelID, expressID, true);
    for (const ps of psets || []) {
      const pName = extractStr(ps.Name) || ifcApi.GetNameFromTypeCode(ps.type) || 'PropertySet';
      const items = [];
      for (const prop of ps.HasProperties || []) {
        const k = extractStr(prop.Name);
        const v = extractStr(prop.NominalValue);
        if (k) items.push({ key: k, value: v || '—' });
      }
      for (const q of ps.Quantities || []) {
        const k = extractStr(q.Name);
        const v =
          extractStr(q.AreaValue) ||
          extractStr(q.VolumeValue) ||
          extractStr(q.LengthValue) ||
          extractStr(q.WeightValue) ||
          extractStr(q.CountValue);
        if (k) items.push({ key: k, value: v || '—' });
      }
      if (items.length) propertySets.push({ name: pName, items });
    }
  } catch {
    // Fallback if propertySets unavailable
  }

  const materials = [];
  try {
    const mats = await ifcApi.properties.getMaterialsProperties(modelID, expressID, true);
    for (const m of mats || []) {
      const n = extractStr(m.Name) || extractStr(m.ForLayerSet?.LayerSetName);
      if (n) materials.push(n);
    }
  } catch {
    // ignore
  }

  return {
    expressID,
    type: typeName,
    name: extractStr(raw.Name) || extractStr(raw.LongName) || typeName,
    globalId: extractStr(raw.GlobalId),
    tag: extractStr(raw.Tag),
    objectType: extractStr(raw.ObjectType),
    description: extractStr(raw.Description),
    materials,
    propertySets,
  };
}

export function exportIfcScheduleCsv(elementMeta, filename = 'ifc_bim_takeoff.csv') {
  const headers = ['ExpressID', 'GlobalId (IfcGuid)', 'IFC Class', 'Name', 'Tag', 'Storey'];
  const rows = [];
  for (const el of elementMeta.values()) {
    if (!el.hasMesh) continue;
    rows.push([el.expressID, el.globalId, el.type, el.name, el.tag, el.storey]);
  }
  const csv = [
    headers.join(','),
    ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
