# 🎨 Universal Canvas & Artifacts Guide

The **Universal Canvas** gives your end users a **Claude Artifacts** and **ChatGPT Canvas** experience inside your own web applications, client portals, and SaaS products.

When an AI agent writes contracts, Python scripts, Excel sheets, presentations, or CAD drawings, users can view, co-edit, and export them directly in real-time.

---

## 📦 What the API Returns for Artifacts

Whether in streaming mode (`delta.artifacts`) or synchronous mode (`message.artifacts`), the engine provides structured artifact metadata:

```json
[
  {
    "artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c",
    "title": "Application for Leave of Absence",
    "filename": "leave_application.md",
    "artifact_type": "document",
    "current_version": 1,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "embed_url": "/embed/canvas?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
]
```

### Supported Artifact Types:
- **`document`**: Interactive rich-text & Markdown documents. Exports to `.docx` and `.pdf`.
- **`spreadsheet`**: Interactive SheetGrid. Supports formulas and exports to `.xlsx` and `.csv`.
- **`presentation`**: Interactive SlidePlayer with bullet hierarchy and presenter notes. Exports to `.pptx`.
- **`cad_2d` / `cad_3d`**: AutoCAD DXF 2D entity viewers and Three.js 3D WebGL viewports (`.step`, `.stl`, `.obj`).
- **`code`**: Monaco code editor with multi-language syntax highlighting.

---

## 🖥️ UI Integration Mode: Drop-In Iframe Mounting

Mount the Canvas inside any modal dialog, slide-over drawer, or split-pane container:

```html
<!-- HTML / React / Vue / Svelte Embed -->
<iframe
  id="canvas-frame"
  src="https://your-engine-domain.com/embed/canvas?token=SIGNED_EMBED_TOKEN&theme=dark"
  style="width: 100%; height: 100%; border: none;"
  title="Interactive Document Canvas"
  allow="clipboard-write"
/>
```

### Iframe URL Parameters & Input Controls:

| Parameter | Location | Type | Description |
|---|---|---|---|
| `token` | Query parameter (`in embed_url`) | String (JWT) | Pre-signed HMAC token authorizing secure access to this specific artifact without revealing master API keys. |
| `theme` | Query parameter (`&theme=dark` or `&theme=light`) | String | Sets initial Canvas color theme matching your parent site. |
| `allow="clipboard-write"` | HTML `<iframe>` attribute | Attribute | Enables users to use one-click code/text copy buttons inside the Canvas. |

---

## 🔄 Bidirectional `window.postMessage` Events

The Canvas iframe communicates with your host application via standard browser `postMessage` events:

### 1. Inbound Events (Host ➔ Iframe)

#### Switch Theme Dynamically:
```javascript
function setCanvasTheme(theme) {
  const iframe = document.getElementById("canvas-frame");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: "THEME_CHANGE", theme }, "*");
  }
}
```

### 2. Outbound Events (Iframe ➔ Host)

```javascript
window.addEventListener("message", (e) => {
  const iframe = document.getElementById("canvas-frame");
  if (!iframe) return;

  // Event A: Handle Close (User clicked X in Canvas header)
  if (e.data?.type === "CANVAS_CLOSE") {
    console.log("Closing canvas for artifact:", e.data.artifactId);
    iframe.style.display = "none"; // Close modal, slide drawer, or unmount
  }

  // Event B: Handle Fullscreen Expansion
  if (e.data?.type === "CANVAS_FULLSCREEN_CHANGE") {
    if (e.data.isFullscreen) {
      // Expand iframe to cover browser viewport (DOM level, preserving browser URL bar)
      iframe.style.position = "fixed";
      iframe.style.top = "0";
      iframe.style.left = "0";
      iframe.style.width = "100vw";
      iframe.style.height = "100vh";
      iframe.style.zIndex = "99999";
    } else {
      // Restore default layout
      iframe.style.position = "static";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.zIndex = "auto";
    }
  }
});
```

---

## 🛠️ Headless Mode: REST & SSE Endpoints

If you prefer building a custom editor or mobile application without iframes, use the dedicated headless endpoints:

```bash
# 1. Fetch Document Metadata, Title & Block Outline
curl -X GET "https://api.yourdomain.com/api/v1/artifacts/ART_ID?token=SIGNED_EMBED_TOKEN"

# 2. Fetch Specific Section Block Content
curl -X GET "https://api.yourdomain.com/api/v1/artifacts/ART_ID/blocks/sec_1?token=SIGNED_EMBED_TOKEN"

# 3. Save Inline User Edits (Creates Version Diff & Updates Canvas)
curl -X PUT "https://api.yourdomain.com/api/v1/artifacts/ART_ID/blocks/sec_1?token=SIGNED_EMBED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "## Updated Section Heading\n\nModified text written by user.",
    "summary": "User edited section 1 via custom mobile UI"
  }'

# 4. Subscribe to Real-Time Live Typing Stream (SSE)
curl -N -X GET "https://api.yourdomain.com/api/v1/artifacts/ART_ID/stream?token=SIGNED_EMBED_TOKEN"

# 5. Direct Binary File Exports & Instant Download Links
curl -O "https://api.yourdomain.com/api/v1/artifacts/ART_ID/export?format=docx&token=SIGNED_EMBED_TOKEN"
curl -O "https://api.yourdomain.com/api/v1/artifacts/ART_ID/export?format=pdf&token=SIGNED_EMBED_TOKEN"
curl -O "https://api.yourdomain.com/api/v1/artifacts/ART_ID/export?format=xlsx&token=SIGNED_EMBED_TOKEN"
curl -O "https://api.yourdomain.com/api/v1/artifacts/ART_ID/export?format=pptx&token=SIGNED_EMBED_TOKEN"

# 6. Delete All Artifacts for a Session
curl -X DELETE "https://api.yourdomain.com/api/v1/artifacts/session/SESSION_ID" \
  -H "X-API-Key: YOUR_TENANT_API_KEY"
```

---

## 🔒 Production Security Architecture

Never expose your master tenant API key (`sk_mgr_...`) to client browsers:

```
[ End User Browser ] ─── (User Message) ───► [ Your Backend Server ]
                                                     │
                                                     ▼ (Includes Bearer sk_mgr_...)
                                           [ AI Skill Engine Gateway ]
                                                     │
                                                     ▼ (Mints Ephemeral HMAC Token)
[ End User Browser ] ◄─── (embed_url + token) ─── [ Your Backend Server ]
        │
        ▼ (Mounts <iframe src="https://engine.../embed/canvas?token=..."/>)
[ Interactive Document Canvas ]
```

1. **Proxy in Backend**: Your server calls `/api/v1/chat/completions` using your master tenant key.
2. **Ephemeral HMAC Token**: The engine generates a time-bounded (30 min) token scoped exclusively to the requested artifact.
3. **Safe Forwarding**: Your backend forwards only the `embed_url` and `token` to the browser.
4. **Automatic Refresh**: The Canvas automatically calls `/refresh-token` every 22 minutes to maintain seamless sessions without user disruption.
5. **Renewing Expired Tokens**: When end users browse older conversation threads, your backend can generate a fresh token on demand:
   ```bash
   curl -X POST "http://localhost:2704/api/v1/artifacts/ART_ID/embed-token?expires_in_minutes=60" \
     -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY"
   ```

---

## 🧭 Next Steps

- **[Session Storage & Cloud Files](session-storage.md)**: Purge session files and assets when conversations end.
- **[API Reference](api-reference.md)**: Explore the completions endpoint parameters.
