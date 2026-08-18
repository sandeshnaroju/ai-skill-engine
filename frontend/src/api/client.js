export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const errorListeners = new Set();

function notifyErrorListeners(error, options = {}) {
  if (options.silent) return;
  errorListeners.forEach((listener) => {
    try {
      listener(error, options);
    } catch (e) {
      console.error('Error in API error listener:', e);
    }
  });
}

async function request(endpoint, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    apiKey = null,
    tenantKey = null,
    tenantId = null,
    params = null,
    silent = false,
    ...customConfig
  } = options;

  let effectiveTenantId = tenantId;
  let cleanedParams = params ? { ...params } : null;

  if (cleanedParams) {
    if (cleanedParams.tenant_id) {
      effectiveTenantId = effectiveTenantId || cleanedParams.tenant_id;
    }
    if (cleanedParams.tenantId) {
      effectiveTenantId = effectiveTenantId || cleanedParams.tenantId;
    }
  }

  let url = endpoint;
  if (cleanedParams) {
    const query = new URLSearchParams();
    Object.entries(cleanedParams).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });
    const queryString = query.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const reqHeaders = {
    ...headers,
  };

  if (body && !(body instanceof FormData) && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  if (apiKey) {
    reqHeaders['Authorization'] = `Bearer ${apiKey}`;
  }
  if (tenantKey) {
    reqHeaders['X-API-Key'] = tenantKey;
  }
  if (effectiveTenantId) {
    reqHeaders['X-Tenant-ID'] = effectiveTenantId;
  }

  const config = {
    method,
    headers: reqHeaders,
    ...customConfig,
  };

  if (body) {
    config.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    const error = new ApiError(err.message || 'Network failure or server unreachable', 0, null);
    notifyErrorListeners(error, options);
    throw error;
  }

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let errorMessage = 'Request failed';
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data.detail)) {
        errorMessage = data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
      } else if (data.detail) {
        errorMessage = data.detail;
      } else if (data.message) {
        errorMessage = data.message;
      }
    } else if (typeof data === 'string' && data.trim()) {
      errorMessage = data;
    } else {
      errorMessage = `Request failed with status ${response.status}`;
    }

    const apiError = new ApiError(errorMessage, response.status, data);
    notifyErrorListeners(apiError, options);
    throw apiError;
  }

  return data;
}

export const apiClient = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
  onError: (listener) => {
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
  },
  fetchRaw: (endpoint, options = {}) => {
    const {
      method = 'GET',
      headers = {},
      body = null,
      apiKey = null,
      tenantKey = null,
      tenantId = null,
      params = null,
      ...customConfig
    } = options;

    let effectiveTenantId = tenantId;
    let cleanedParams = params ? { ...params } : null;

    if (cleanedParams) {
      if (cleanedParams.tenant_id) {
        effectiveTenantId = effectiveTenantId || cleanedParams.tenant_id;
        delete cleanedParams.tenant_id;
      }
      if (cleanedParams.tenantId) {
        effectiveTenantId = effectiveTenantId || cleanedParams.tenantId;
        delete cleanedParams.tenantId;
      }
    }

    let url = endpoint;
    if (cleanedParams) {
      const query = new URLSearchParams();
      Object.entries(cleanedParams).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          query.append(key, val);
        }
      });
      const queryString = query.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    const reqHeaders = { ...headers };
    if (body && !(body instanceof FormData) && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (apiKey) {
      reqHeaders['Authorization'] = `Bearer ${apiKey}`;
    }
    if (tenantKey) {
      reqHeaders['X-API-Key'] = tenantKey;
    }
    if (effectiveTenantId) {
      reqHeaders['X-Tenant-ID'] = effectiveTenantId;
    }

    const config = {
      method,
      headers: reqHeaders,
      ...customConfig,
    };
    if (body) {
      config.body = body instanceof FormData ? body : JSON.stringify(body);
    }

    return fetch(url, config);
  },
  request,
};
