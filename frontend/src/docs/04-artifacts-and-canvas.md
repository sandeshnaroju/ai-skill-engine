# 🎨 Embedding Artifacts & Universal Canvas

When models generate complex outputs—such as business reports, financial models, presentation decks, or engineering schematics—AI Skill Engine turns them into **Interactive Canvas Artifacts**.

Users can co-edit, view revisions, format cells, present slides, or export files directly from your application.

---

## 1. Supported Artifact Types

| Type | Best For | Viewer Experience | Supported Exports |
| :--- | :--- | :--- | :--- |
| **Document** | Reports, proposals, articles | Full-width document editor with real-time section co-editing | `.docx`, `.pdf`, `.md` |
| **Spreadsheet** | Financial models, budgets, tables | Interactive Excel-style grid powered by SheetJS with formula evaluation | `.xlsx`, `.csv` |
| **Presentation**| Pitch decks, slide briefs | Modern slide deck viewer with presenter mode and theme switching | `.pptx`, `.pdf` |
| **Diagram (SVG)**| Flowcharts, system architectures | High-definition zoomable vector canvas | `.svg`, `.png` |
| **AutoCAD 3D** | Engineering components, enclosures | Three.js WebGL 3D model viewport with orbit, pan, and wireframe controls | `.obj`, `.stl`, `.gltf` |
| **PCB Layout** | Circuit boards, hardware schematics | Interactive PCB board designer with layers and pad inspection | `.gerber`, `.svg` |

---

## 2. Option A: Embedding via Iframe (Easiest)

When the agent creates an artifact, the response includes a signed HMAC embed URL:
```json
{
  "artifact_id": "art_991823ab",
  "title": "2026 Budget Forecast",
  "artifact_type": "spreadsheet",
  "embed_url": "/embed/canvas?token=eyJhbGciOiJIUzI1NiIsIn..."
}
```

You can embed this viewer into any web page or React app with a single `<iframe>`:

```html
<iframe
  src="http://localhost:2704/embed/canvas?token=eyJhbGciOiJIUzI1NiIsIn..."
  width="100%"
  height="700px"
  frameborder="0"
  allow="clipboard-write"
></iframe>
```

### Listening to Canvas Events via `postMessage`
Your parent web application can listen to live user actions occurring inside the embedded Canvas:

```javascript
window.addEventListener("message", (event) => {
  if (event.origin !== "http://localhost:2704") return;

  const { type, artifactId, payload } = event.data;

  switch (type) {
    case "ARTIFACT_SAVED":
      console.log(`Artifact ${artifactId} was updated by the user:`, payload);
      break;
    case "EXPORT_TRIGGERED":
      console.log(`User downloaded format: ${payload.format}`);
      break;
  }
});
```

---

## 3. Option B: Headless REST API (Custom UI)

If you prefer building your own custom editors or native mobile interfaces without an iframe, use the Headless Artifact REST APIs:

### 1. Get Artifact Metadata & Source Content
```bash
curl -X GET http://localhost:2704/api/v1/artifacts/{artifact_id} \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
```

**Response Example:**
```json
{
  "id": "art_991823ab",
  "title": "2026 Budget Forecast",
  "artifact_type": "spreadsheet",
  "content": "{\"sheets\": [{\"name\": \"Q1\", \"cells\": {\"A1\": {\"value\": \"Revenue\"}}}]}",
  "version": 3,
  "created_at": "2026-11-15T10:00:00Z"
}
```

### 2. Stream Live Section Edits (SSE)
Connect to real-time block streaming as the AI updates individual paragraphs or spreadsheet cells:
```bash
curl -N -X GET http://localhost:2704/api/v1/artifacts/{artifact_id}/stream \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
```

### 3. Direct Binary Export
Download the compiled binary directly without rendering:
```bash
# Export as Excel
curl -X GET "http://localhost:2704/api/v1/artifacts/{artifact_id}/export?format=xlsx" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -o "budget.xlsx"

# Export as PDF
curl -X GET "http://localhost:2704/api/v1/artifacts/{artifact_id}/export?format=pdf" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -o "report.pdf"
```

---

## 4. Inspecting & Reverting Artifact Revisions

Every modification to an artifact is committed to an internal version tree. You can inspect previous versions and rollback individual sections at any time:

```bash
# 1. List commit history
curl -X GET http://localhost:2704/api/v1/artifacts/{artifact_id}/commits \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"

# 2. Rollback a block to target version
curl -X POST http://localhost:2704/api/v1/artifacts/{artifact_id}/blocks/{block_key}/rollback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{"target_version": 1}'
```
