# 🛡️ Security, Tokens & Uploaded Files in Canvas

This guide explains the security proxy architecture for embedding Canvas without leaking credentials, token refresh cycles, and how uploaded files are converted into interactive Canvas documents.

---

## 🔒 Security & Token Proxy Architecture

Never expose your master tenant API key (`sk_mgr_...`) in client-side code or browser network requests. Instead, use the **Token Proxy Pattern**:

1. Your user sends a chat message to **your application backend**.
2. Your backend calls AI Skill Engine using your **Tenant API Key**.
3. AI Skill Engine generates the document and returns a signed, ephemeral **HMAC embed token**.
4. Your backend passes only this `embed_url` (with `token`) to the user's browser.
5. The browser loads the Canvas iframe using only this scoped token.

```
┌─────────────────┐       ┌──────────────────────┐       ┌─────────────────────┐
│  End User UI    │ ────> │ Your App Backend     │ ────> │ AI Skill Engine     │
│  (Browser/App)  │       │ (Keeps Master Key)   │       │ (Port 8000)         │
│                 │ <──── │                      │ <──── │                     │
│                 │       │ Passes Embed Token   │       │ Returns Embed Token │
│                 │       └──────────────────────┘       └─────────────────────┘
│                 │                                                 ▲
│ Loads Iframe    │ ────────────────────────────────────────────────┘
│ with ?token=... │   (Scoped to single artifact ID + time-bounded)
└─────────────────┘
```

### Token Properties

- **HMAC-SHA256 Signed**: Cryptographically bound to the specific `artifact_id` and `tenant_name`.
- **Time-Bounded Expiry**: Default 30-minute validity.
- **Silent Refresh**: The pre-built Canvas iframe automatically triggers `POST /api/v1/artifacts/{id}/refresh-token` every 22 minutes in the background to prevent user interruption during long sessions.

---

## 🔑 Minting Fresh Tokens via Backend

If an artifact token expires or you wish to allow users to revisit an old document from a saved history view, your backend can mint a fresh token on demand:

```bash
curl -X POST "http://localhost:8000/api/v1/artifacts/{artifact_id}/embed-token?expires_in_minutes=60" \
  -H "X-API-Key: {TENANT_API_KEY}"
```

### Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in_seconds": 3600,
  "artifact_id": "84419384-8e98-4b7f-bc21-8f2abe21f44c",
  "embed_url": "/embed/canvas?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## ⚡ Client-Side Token Expiry Check (JavaScript / React)

You can check whether a cached token is expired or close to expiring without importing heavy JWT libraries:

```javascript
// Decode the base64 payload segment of the token
function decodeEmbedToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const rawB64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = rawB64.padEnd(rawB64.length + ((4 - (rawB64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// Check if token expires within a buffer window (e.g. 60 seconds)
export function isEmbedTokenExpired(token, bufferSeconds = 60) {
  const payload = decodeEmbedToken(token);
  if (!payload || !payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= (now + bufferSeconds);
}

// Example usage before mounting an iframe:
if (isEmbedTokenExpired(artifact.token)) {
  // Call your backend API to get a fresh token:
  const { embed_url } = await api.refreshArtifactToken(artifact.id);
  mountCanvas(embed_url);
}
```

---

## 📂 Opening Uploaded Files in Canvas

When users upload an existing file and ask to view or edit it in chat (e.g., *"Open this spreadsheet in Canvas"*, *"Edit slide 3 of the presentation"*), the `artifact_editor` skill calls `open_uploaded_file_as_artifact`.

### Supported File Formats & Canvas Modes

| Category | Extensions | Canvas Renderer | Interactive Features |
|---|---|---|---|
| **Documents & PDFs** | `.docx`, `.doc`, `.pdf`, `.md`, `.txt` | Document Editor | Surgical section editing, heading tree navigation, markdown live preview |
| **Spreadsheets** | `.xlsx`, `.xls`, `.csv`, `.tsv` | SheetGrid | Multi-tab sheets, cell editing, formula computation, row/column reordering |
| **Presentations** | `.pptx`, `.ppt` | SlidePlayer | Slide thumbnail strip, presenter notes, bullet point hierarchy editing |
| **Engineering & CAD** | `.dxf`, `.dwg`, `.step`, `.stl`, `.obj` | 3D / CAD Viewport | WebGL / Three.js orbit view, mesh inspection, layer toggles |
| **GIS & Industrial** | `.geojson`, `.kml`, `.l5x`, `.xer` | Data Inspector | Interactive map markers, PLC ladder logic blocks, Primavera P6 schedules |
| **Code & Media** | `.py`, `.js`, `.ts`, `.mp3`, `.mp4` | Monaco / Media | Syntax highlighting, line numbers, media player |

---

## 🔄 End-to-End File-to-Canvas Workflow

### Step 1: Upload the File

```bash
curl -X POST http://localhost:8000/api/v1/files/upload \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -F "file=@financial_report.docx" \
  -F "session_id=user_thread_801"
```

### Step 2: Prompt the Assistant to Open It

```bash
curl -N -X POST http://localhost:8000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY" \
  -d '{
    "messages": [
      {"role": "user", "content": "I uploaded financial_report.docx. Please open it in the canvas editor."}
    ],
    "model": "gemini-2.5-flash",
    "stream": true,
    "session_id": "user_thread_801",
    "skill_names": ["artifact_editor"]
  }'
```

The model automatically invokes `open_uploaded_file_as_artifact` and streams an artifact chunk with a ready-to-mount `embed_url`.

---

## 🧭 Related Guides

- **[Canvas Iframe & Embedding](frontend-canvas.md)** — Iframe integration and postMessage event handlers
- **[Headless Canvas REST & SSE](frontend-headless.md)** — Direct REST and SSE endpoints for custom editors
- **[Files & Session Lifecycle](backend-files.md)** — File upload, download, and cascade purge APIs
