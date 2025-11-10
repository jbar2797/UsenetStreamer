(function () {
  const storageKey = 'usenetstreamer.adminToken';
  const tokenInput = document.getElementById('tokenInput');
  const loadButton = document.getElementById('loadConfig');
  const authError = document.getElementById('authError');
  const configSection = document.getElementById('configSection');
  const configForm = document.getElementById('configForm');
  const manifestLink = document.getElementById('manifestLink');
  const manifestDescription = document.getElementById('manifestDescription');
  const saveStatus = document.getElementById('saveStatus');

  let runtimeEnvPath = null;

  function getStoredToken() {
    return localStorage.getItem(storageKey) || '';
  }

  function extractTokenFromPath() {
    const match = window.location.pathname.match(/^\/([^/]+)\/admin(?:\/|$)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function setStoredToken(token) {
    if (!token) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, token);
  }

  function getToken() {
    return tokenInput.value.trim();
  }

  function setToken(token) {
    tokenInput.value = token;
    setStoredToken(token);
  }

  function markLoading(isLoading) {
    loadButton.disabled = isLoading;
    loadButton.textContent = isLoading ? 'Loading...' : 'Load Configuration';
  }

  function markSaving(isSaving) {
    const submitButton = configForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = isSaving;
      submitButton.textContent = isSaving ? 'Saving...' : 'Save & Restart';
    }
  }

  function parseBool(value) {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined) return false;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }

  function populateForm(values) {
    const elements = configForm.querySelectorAll('input[name], select[name], textarea[name]');
    elements.forEach((element) => {
      const key = element.name;
      const rawValue = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : '';
      if (element.type === 'checkbox') {
        element.checked = parseBool(rawValue);
      } else if (element.type === 'number' && rawValue === '') {
        element.value = '';
      } else {
        element.value = rawValue ?? '';
      }
    });
  }

  function collectFormValues() {
    const payload = {};
    const elements = configForm.querySelectorAll('input[name], select[name], textarea[name]');
    elements.forEach((element) => {
      const key = element.name;
      if (!key) return;
      if (element.type === 'checkbox') {
        payload[key] = element.checked ? 'true' : 'false';
      } else {
        payload[key] = element.value != null ? element.value.toString() : '';
      }
    });
    return payload;
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();
    if (!token) throw new Error('Addon token is required');

    const headers = Object.assign({}, options.headers || {}, {
      'X-Addon-Token': token,
    });

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(path, Object.assign({}, options, { headers }));
    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.json();
        if (body && body.error) message = body.error;
      } catch (err) {
        // ignore json parse errors
      }
      if (response.status === 401) {
        throw new Error('Unauthorized: check your addon token');
      }
      throw new Error(message || 'Request failed');
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function loadConfiguration() {
    authError.classList.add('hidden');
    markLoading(true);
    saveStatus.textContent = '';

    try {
      const data = await apiRequest('/admin/api/config');
      populateForm(data.values || {});
      configSection.classList.remove('hidden');
      updateManifestLink(data.manifestUrl || '');
      runtimeEnvPath = data.runtimeEnvPath || null;
      const baseMessage = 'Add this manifest to Stremio once HTTPS is set.';
      manifestDescription.textContent = baseMessage;
    } catch (error) {
      authError.textContent = error.message;
      authError.classList.remove('hidden');
      configSection.classList.add('hidden');
    } finally {
      markLoading(false);
    }
  }

  function updateManifestLink(url) {
    if (!url) {
      manifestLink.textContent = 'Not configured';
      manifestLink.removeAttribute('href');
      return;
    }
    manifestLink.textContent = url;
    manifestLink.href = url;
  }

  async function saveConfiguration(event) {
    event.preventDefault();
    saveStatus.textContent = '';

    try {
      markSaving(true);
      const values = collectFormValues();
      await apiRequest('/admin/api/config', {
        method: 'POST',
        body: JSON.stringify({ values }),
      });
      saveStatus.textContent = 'Configuration saved. The addon will restart in a few seconds...';
    } catch (error) {
      saveStatus.textContent = `Error: ${error.message}`;
    } finally {
      markSaving(false);
    }
  }

  loadButton.addEventListener('click', () => {
    const token = getToken();
    if (!token) {
      authError.textContent = 'Addon token is required to load settings.';
      authError.classList.remove('hidden');
      return;
    }
    setStoredToken(token);
    loadConfiguration();
  });

  configForm.addEventListener('submit', saveConfiguration);

  const pathToken = extractTokenFromPath();
  if (pathToken) {
    setToken(pathToken);
    loadConfiguration();
  } else {
    const initialToken = getStoredToken();
    if (initialToken) {
      setToken(initialToken);
      loadConfiguration();
    }
  }
})();
