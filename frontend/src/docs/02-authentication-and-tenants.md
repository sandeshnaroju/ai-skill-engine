# 🔑 Authentication & Workspaces

AI Skill Engine is architected around **Multi-Tenant Isolation**. Every request to the platform belongs to a specific workspace (tenant), ensuring that conversation history, custom tools, uploaded files, and token usage metrics remain completely segregated.

---

## 1. Authentication Headers

External API clients authenticate requests using their Tenant API Key. You can provide this key in either of two standard HTTP headers:

### Method A: Standard Bearer Token (Recommended)
```http
Authorization: Bearer sk_mgr_YOUR_TENANT_API_KEY
```

### Method B: Custom Header
```http
X-API-Key: sk_mgr_YOUR_TENANT_API_KEY
```

> **Security Note**: Never expose your `sk_mgr_` Tenant API Key in client-side public code (such as React single-page apps or mobile bundles). Always route calls through your own backend server or API proxy.

---

## 2. Managing Workspaces (Tenants)

### Via Dashboard
1. Log in to the Admin Dashboard.
2. Navigate to **Tenants & Keys** (`/tenants`).
3. Click **+ Create Tenant** to add a new isolated workspace for a client, customer, or internal department.
4. Each workspace displays its unique `ID` and `API Key`.

### Via REST API
Admin users can create and manage tenant workspaces programmatically:

#### List All Accessible Tenants
```bash
curl -X GET http://localhost:2704/api/v1/tenants \
  -H "Authorization: Bearer sk_mgr_YOUR_ADMIN_KEY"
```

#### Create a New Tenant Workspace
```bash
curl -X POST http://localhost:2704/api/v1/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_mgr_YOUR_ADMIN_KEY" \
  -d '{
    "name": "Acme Corp Production",
    "timezone": "America/New_York"
  }'
```

---

## 3. What is Scoped to a Tenant?

When an API client authenticates with `sk_mgr_...`, the platform automatically enforces strict boundaries:

| Resource | Tenant Scoping Behavior |
| :--- | :--- |
| **Chat Sessions** | Only sessions belonging to that tenant can be viewed or resumed. |
| **Files & Storage** | Uploaded documents and generated reports are stored in that tenant's dedicated storage directory. |
| **Custom Skills** | Tenant-specific skills (e.g., private ERP connectors) are only visible and callable within that tenant. |
| **Scheduled Tasks** | Automated background jobs run strictly in the tenant's localized timezone and budget context. |
| **Token Tracking & Quotas** | Usage costs, input/output token counts, and execution latency are tracked individually per tenant. |

---

## 4. Error Responses

If an invalid or missing key is provided, the API returns a standard JSON error:

```json
// 401 Unauthorized
{
  "detail": "Invalid or inactive API Key"
}
```
