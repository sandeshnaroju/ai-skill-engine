# 🖼️ Canvas Iframe & Embedding

Embed an interactive **Universal Canvas** and live collaborative workspace directly into your SaaS application, admin portal, or custom frontend. When your AI writes contracts, reports, code scripts, spreadsheets, or presentations, users can view, co-edit, and export them in real time.

---

## 1. Extracting Artifacts from API Responses

When the AI model generates or updates a document, AI Skill Engine includes a structured `artifacts` array in the response payload:

- **Streaming (`stream: true`)**: Inspect `chunk.choices[0].delta.artifacts`
- **Synchronous (`stream: false`)**: Inspect `response.choices[0].message.artifacts` or top-level `response.artifacts`

### Artifacts Array Schema

```json
[
  {
    "artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c",
    "title": "Executive Modernization Plan",
    "filename": "exec_plan.md",
    "artifact_type": "document",
    "current_version": 1,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "embed_url": "/embed/canvas?token=eyJhbGciOi..."
  }
]
```

**Artifact Types:** `document` (Markdown/Docx/PDF) | `code` (Monaco Editor) | `spreadsheet` (SheetGrid) | `presentation` (SlidePlayer) | `svg` (Vector Graphic)

### JavaScript / React — Streaming Extraction

```javascript
const delta = dataJson.choices[0]?.delta;

if (delta?.artifacts && Array.isArray(delta.artifacts)) {
  for (const artifact of delta.artifacts) {
    const { artifact_id, title, embed_url, token, artifact_type } = artifact;
    // Trigger opening your side drawer or modal with the embedded Canvas:
    openCanvasDrawer(embed_url, title);
  }
}
```

---

## 2. Mounting the Iframe in Your App

Mount the interactive Canvas in a side panel, slide-over drawer, or modal dialog by setting the `<iframe>` source to your engine's base URL + the artifact's `embed_url`.

### Iframe URL & Protocol Parameters

| Parameter | Location | Type | Description |
|---|---|---|---|
| `token` | Query parameter (in `embed_url`) | Signed JWT | Authorizes view & edit permissions for this artifact without exposing your master API key. |
| `theme` | Query parameter | `"dark"` \| `"light"` | Sets the Canvas visual color palette (defaults to `"dark"`). |
| `THEME_CHANGE` | `postMessage` (Host → Iframe) | `{ type: 'THEME_CHANGE', theme: 'dark'\|'light' }` | Dynamically update theme on the fly without iframe reload. |
| `CANVAS_FULLSCREEN_CHANGE` | `postMessage` (Iframe → Host) | `{ type: 'CANVAS_FULLSCREEN_CHANGE', isFullscreen: boolean }` | Dispatched when the user clicks Fullscreen or presses Esc. |
| `CANVAS_CLOSE` | `postMessage` (Iframe → Host) | `{ type: 'CANVAS_CLOSE', artifactId: string }` | Dispatched when the user clicks the (X) Close button in the Canvas header. |
| `allow="clipboard-write"` | HTML iframe attribute | Attribute | Required so one-click copy buttons inside Canvas work properly. |

---

## 3. Complete Iframe Integration Example (HTML & JS)

```html
<!-- 1. Mount iframe with full host URL, token, and theme -->
<iframe
  id="canvas-frame"
  src="https://api.yourdomain.com/embed/canvas?token=YOUR_TOKEN&theme=dark"
  style="width: 100%; height: 100%; border: none; transition: all 0.2s ease;"
  title="Interactive Canvas Workspace"
  allow="clipboard-write"
></iframe>

<script>
  // 2. Listen for Canvas events (Close & Fullscreen)
  window.addEventListener("message", (e) => {
    const iframe = document.getElementById("canvas-frame");
    if (!iframe) return;

    // Handle user clicking the (X) Close button inside the Canvas
    if (e.data?.type === "CANVAS_CLOSE") {
      iframe.style.display = "none"; // or trigger your app's drawer close
    }

    // Handle Fullscreen toggle
    if (e.data?.type === "CANVAS_FULLSCREEN_CHANGE") {
      if (e.data.isFullscreen) {
        iframe.style.position = "fixed";
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.style.width = "100vw";
        iframe.style.height = "100vh";
        iframe.style.zIndex = "99999";
      } else {
        iframe.style.position = "static";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.zIndex = "auto";
      }
    }
  });

  // 3. Dynamically synchronize theme with your parent app
  function syncTheme(theme) {
    const iframe = document.getElementById("canvas-frame");
    iframe?.contentWindow?.postMessage({ type: "THEME_CHANGE", theme }, "*");
  }
</script>
```

---

## 🧭 Related Guides

- **[Headless Canvas REST & SSE](frontend-headless.md)** — Build custom editor UIs using low-level REST and SSE streams
- **[Security, Tokens & Uploaded Files](frontend-security.md)** — HMAC token proxy patterns and opening uploaded files in Canvas
- **[Chat Completions & Streaming](backend-api.md)** — Invoking the chat completion endpoint with artifact capabilities
