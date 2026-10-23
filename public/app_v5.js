document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const landingView = document.getElementById('landing-view');
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  
  // Landing Page Elements
  const showSubscribeBtn = document.getElementById('show-subscribe-btn');
  const showLoginBtn = document.getElementById('show-login-btn');
  const subscribeModal = document.getElementById('subscribe-modal');
  const closeSubscribeModal = document.getElementById('close-subscribe-modal');
  const subscribeForm = document.getElementById('subscribe-form');
  const subscribeMsg = document.getElementById('subscribe-msg');
  const subscribeSubmitBtn = document.getElementById('subscribe-submit-btn');
  
  const userRoleBadge = document.getElementById('user-role-badge');
  const userNameEl = document.getElementById('logged-username');
  const logoutBtn = document.getElementById('logout-btn');
  
  const auditLogsSection = document.getElementById('audit-logs-section');
  const auditLogsTbody = document.getElementById('audit-logs-tbody');
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');

  const showAddUserBtn = document.getElementById('show-add-user-btn');
  const refreshUsersBtn = document.getElementById('refresh-users-btn');
  const addUserPanel = document.getElementById('add-user-panel');
  const cancelAddUserBtn = document.getElementById('cancel-add-user-btn');
  const addUserForm = document.getElementById('add-user-form');
  const addUserError = document.getElementById('add-user-error');
  
  const plantFloorSection = document.getElementById('plant-floor-section');
  const refreshDevicesBtn = document.getElementById('refresh-devices-btn');
  const showAddPlcBtn = document.getElementById('show-add-plc-btn');
  const addPlcPanel = document.getElementById('add-plc-panel');
  const cancelAddPlcBtn = document.getElementById('cancel-add-plc-btn');
  const addPlcForm = document.getElementById('add-plc-form');
  const addPlcMsg = document.getElementById('add-plc-msg');
  const devicesTbody = document.getElementById('devices-tbody');
  
  // PLC Detail View Elements
  const plcDetailView = document.getElementById('plc-detail-view');
  const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
  const plcDetailTitle = document.getElementById('plc-detail-title');
  const showAddGraphBtn = document.getElementById('show-add-graph-btn');
  const showAddCmdBtn = document.getElementById('show-add-cmd-btn');
  const showAddDisplayBtn = document.getElementById('show-add-display-btn');
  const uploadBgInput = document.getElementById('upload-bg-input');
  const viewsTabsContainer = document.getElementById('views-tabs-container');
  const widgetSettingsModal = document.getElementById('widget-settings-modal');
  const widgetSettingsForm = document.getElementById('widget-settings-form');
  const closeWidgetSettingsModal = document.getElementById('close-widget-settings-modal');

  const plcCommandsContainer = document.getElementById('plc-commands-container');
  const plcGraphsContainer = document.getElementById('plc-graphs-container');
  const toggleLockBtn = document.getElementById('toggle-lock-btn');
  const toggleAccessBtn = document.getElementById('toggle-access-btn');
  const plcTopNav = document.getElementById('plc-top-nav');
  
  let currentPlcId = null;
  let currentViews = [];
  let activeViewId = null;
  let graphIntervals = [];
  let chartInstances = {};
  let currentEditingWidget = null; // for settings modal
  let isLayoutLocked = true;
  
  const globalGraphModal = document.getElementById('global-graph-modal');
  const globalGraphTitle = document.getElementById('global-graph-title');
  const globalGraphRange = document.getElementById('global-graph-range');
  const closeGlobalGraphBtn = document.getElementById('close-global-graph-btn');
  const widgetSettingTextColor = document.getElementById('widget-setting-text-color');
  const widgetSettingBgColor = document.getElementById('widget-setting-bg-color');
  
  let globalGraphChart = null;
  let globalGraphFeature = null;
  let globalGraphInterval = null;

  async function openGlobalGraph(feature) {
    if (!feature) return;
    globalGraphFeature = feature;
    globalGraphTitle.textContent = 'History: ' + feature;
    globalGraphModal.classList.remove('hidden');
    await fetchAndRenderGlobalGraph();
    if (globalGraphInterval) clearInterval(globalGraphInterval);
    globalGraphInterval = setInterval(fetchAndRenderGlobalGraph, 5000);
  }

  async function fetchAndRenderGlobalGraph() {
    if (!globalGraphFeature) return;
    
    // We fetch without time limits, letting the backend limit by count (e.g. 5000 points)
    // so the user has ALL data to pan/zoom through.
    let url = '/api/telemetry/' + currentPlcId + '?feature=' + encodeURIComponent(globalGraphFeature) + '&limit=5000';
    
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      const labels = data.map(d => new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      const values = data.map(d => d.value);

      const ctx = document.getElementById('global-graph-canvas').getContext('2d');
      if (globalGraphChart) {
        globalGraphChart.data.labels = labels;
        globalGraphChart.data.datasets[0].data = values;
        globalGraphChart.update();
      } else {
        globalGraphChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: globalGraphFeature,
              data: values,
              borderColor: '#00ffcc',
              backgroundColor: 'rgba(0, 255, 204, 0.1)',
              fill: true,
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { display: true, ticks: { maxTicksLimit: 12, maxRotation: 45, minRotation: 45 } }, y: { display: true } },
            plugins: {
              zoom: {
                pan: {
                  enabled: true,
                  mode: 'x'
                },
                zoom: {
                  wheel: {
                    enabled: true,
                  },
                  pinch: {
                    enabled: true
                  },
                  mode: 'x'
                }
              }
            }
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (closeGlobalGraphBtn) {
    closeGlobalGraphBtn.addEventListener('click', () => {
      globalGraphModal.classList.add('hidden');
      if (globalGraphInterval) clearInterval(globalGraphInterval);
      if (globalGraphChart) { globalGraphChart.destroy(); globalGraphChart = null; }
    });
  }

  // Range selection logic removed in favor of infinite scrolling

  let undoStack = [];
  window.undoStack = undoStack; // for debug
  function saveHistory() {
    undoStack.push(JSON.parse(JSON.stringify(currentViews)));
    if (undoStack.length > 20) undoStack.shift();
  }
  
  // Background panning state
  let isDraggingBg = false;
  let bgStartX = 0;
  let bgStartY = 0;
  let initialBgX = 0;
  let initialBgY = 0;

  // State
  let token = sessionStorage.getItem('sf_token');
  let userRole = sessionStorage.getItem('sf_role');
  let userSite = sessionStorage.getItem('sf_site_id');
  let username = sessionStorage.getItem('sf_username');
  let userId = sessionStorage.getItem('sf_user_id') ? parseInt(sessionStorage.getItem('sf_user_id'), 10) : null;
  
  // Fallback: decode JWT to ensure we have the correct user ID
  if (token && !userId) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.id;
      sessionStorage.setItem('sf_user_id', userId);
    } catch(e) {
      console.error('Failed to parse JWT', e);
    }
  }
  
  // Init
  if (token) {
    showDashboard();
  } else {
    showLanding();
  }

  // Auth & Landing Functions
  showLoginBtn.addEventListener('click', showLogin);
  
  showSubscribeBtn.addEventListener('click', () => {
    subscribeMsg.classList.add('hidden');
    subscribeForm.reset();
    subscribeModal.classList.remove('hidden');
  });

  closeSubscribeModal.addEventListener('click', () => {
    subscribeModal.classList.add('hidden');
  });

  subscribeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const companyName = document.getElementById('sub-company-name').value;
    const email = document.getElementById('sub-email').value;
    
    subscribeSubmitBtn.disabled = true;
    subscribeSubmitBtn.textContent = 'Processing...';
    subscribeMsg.classList.add('hidden');

    try {
      const res = await fetch('/auth/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, email })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Subscription failed');

      subscribeMsg.textContent = data.message;
      subscribeMsg.className = 'msg success';
      subscribeMsg.style.color = '#00e676';
      subscribeMsg.classList.remove('hidden');
      subscribeForm.reset();
    } catch (err) {
      subscribeMsg.textContent = err.message;
      subscribeMsg.className = 'msg error';
      subscribeMsg.style.color = '#ff1744';
      subscribeMsg.classList.remove('hidden');
    } finally {
      subscribeSubmitBtn.disabled = false;
      subscribeSubmitBtn.textContent = 'Subscribe & Receive Credentials';
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredUsername = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: enteredUsername, password })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Login failed');

      token = data.token;
      userRole = data.role;
      userSite = data.site_id;
      username = data.username;
      userId = data.id;

      sessionStorage.setItem('sf_token', token);
      sessionStorage.setItem('sf_role', userRole);
      sessionStorage.setItem('sf_site_id', userSite);
      sessionStorage.setItem('sf_username', username);
      sessionStorage.setItem('sf_user_id', userId);

      userNameEl.textContent = username;
      loginError.classList.add('hidden');
      loginForm.reset();
      
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.clear();
    token = null;
    userRole = null;
    userSite = null;
    showLanding();
  });

  // UI Toggles
  function showLanding() {
    dashboardView.classList.add('hidden');
    loginView.classList.add('hidden');
    landingView.classList.remove('hidden');
  }

  function showLogin() {
    dashboardView.classList.add('hidden');
    landingView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  function showDashboard() {
    landingView.classList.add('hidden');
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    dashboardView.classList.add('active');
    
    document.getElementById('logged-username').textContent = username;
    document.getElementById('logged-role').textContent = userRole;
    
    // All roles can see Plant Floor Management
    plantFloorSection.classList.remove('hidden');
    
    const siteInput = document.getElementById('new-site');
    if (userRole === 'Super Admin') {
      auditLogsSection.classList.remove('hidden');
      siteInput.parentElement.classList.remove('hidden'); // Need site ID for manager
      showAddPlcBtn.classList.remove('hidden');
      fetchAuditLogs();
      fetchUsers();
    } else if (userRole === 'Manager') {
      auditLogsSection.classList.add('hidden');
      siteInput.style.display = 'none'; // Site ID comes from Manager's token automatically
      showAddPlcBtn.classList.remove('hidden');
      fetchUsers();
    } else {
      auditLogsSection.classList.add('hidden');
      siteInput.parentElement.classList.add('hidden');
      showAddUserBtn.classList.add('hidden');
      showAddPlcBtn.classList.remove('hidden'); // Engineers can add PLCs
      fetchUsers();
    }

    fetchDevices();
  }

  // --- Devices & Telemetry Logic ---
  showAddPlcBtn.addEventListener('click', () => {
    addPlcPanel.classList.remove('hidden');
    addPlcMsg.classList.add('hidden');
  });

  cancelAddPlcBtn.addEventListener('click', () => {
    addPlcPanel.classList.add('hidden');
    addPlcForm.reset();
  });

  addPlcForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-plc-name').value;
    const zone_id = document.getElementById('new-plc-zone').value;

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name, zone_id: parseInt(zone_id, 10) })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to register PLC');
      
      alert(`PLC Successfully Registered!\n\nIMPORTANT: Save these credentials to configure the physical PLC. They will NOT be shown again.\n\nMQTT Topic: ${data.device.mqtt_topic_base}\nUsername: ${data.device.mqtt_username}\nPassword: ${data.device.mqtt_password}`);

      addPlcPanel.classList.add('hidden');
      addPlcForm.reset();
      fetchDevices(); // Refresh table
    } catch (err) {
      addPlcMsg.textContent = err.message;
      addPlcMsg.style.color = 'var(--accent-alert)';
      addPlcMsg.classList.remove('hidden');
    }
  });

  refreshDevicesBtn.addEventListener('click', fetchDevices);

  async function fetchDevices() {
    try {
      const res = await fetch('/api/devices', {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Failed to fetch devices');
      const devices = await res.json();
      renderDevices(devices);
    } catch (err) {
      console.error(err);
    }
  }

  function renderDevices(devices) {
    const isEngineer = userRole === 'Engineer';
    const siteId = parseInt(userSite);
    devicesTbody.innerHTML = '';
    devices.forEach(device => {
      const tr = document.createElement('tr');
      
      let actionsHtml = `<button class="btn btn-primary" onclick="managePlc(${device.id})">Manage PLC</button>`;
      
      tr.innerHTML = `
        <td>${device.id}</td>
        <td>${device.name}</td>
        <td>${device.zone_id}</td>
        <td>${device.mqtt_topic_base}</td>
        <td>
          ${(device.creator_id === userId || device.allow_all_edit) 
              ? `<button class="btn btn-danger" onclick="deleteDevice(${device.id})">Delete</button>` 
              : ''}
          ${actionsHtml}
        </td>
      `;
      devicesTbody.appendChild(tr);
    });
  }

  window.deleteDevice = async function(deviceId) {
    if (!confirm('Are you sure you want to delete this PLC? All its telemetry data will be erased.')) return;
    
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to delete device');
      
      fetchDevices();
    } catch (err) {
      alert(err.message);
    }
  };

  // Command PLC Modal
  const commandModal = document.getElementById('command-plc-modal');
  const commandForm = document.getElementById('command-plc-form');
  const commandError = document.getElementById('command-error');
  const commandSuccess = document.getElementById('command-success');
  const commandDeviceIdEl = document.getElementById('command-device-id');
  let commandTargetId = null;

  window.openCommandModal = function(deviceId) {
    commandTargetId = deviceId;
    commandDeviceIdEl.textContent = deviceId;
    commandError.classList.add('hidden');
    commandSuccess.classList.add('hidden');
    commandForm.reset();
    commandModal.classList.remove('hidden');
  };

  document.getElementById('close-command-modal').addEventListener('click', () => {
    commandModal.classList.add('hidden');
  });

  commandForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = document.getElementById('command-payload').value;
    commandError.classList.add('hidden');
    commandSuccess.classList.add('hidden');

    try {
      const res = await fetch(`/api/devices/${commandTargetId}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ command: payload })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send command');

      commandSuccess.textContent = `Command sent on topic ${data.topic}`;
      commandSuccess.classList.remove('hidden');
    } catch (err) {
      commandError.textContent = err.message;
      commandError.classList.remove('hidden');
    }
  });

  // Change Password Modal
  const passwordModal = document.getElementById('change-password-modal');
  const passwordForm = document.getElementById('change-password-form');
  const passwordError = document.getElementById('password-error');
  const passwordSuccess = document.getElementById('password-success');

  document.getElementById('change-password-btn').addEventListener('click', () => {
    passwordError.classList.add('hidden');
    passwordSuccess.classList.add('hidden');
    passwordForm.reset();
    passwordModal.classList.remove('hidden');
  });

  document.getElementById('close-password-modal').addEventListener('click', () => {
    passwordModal.classList.add('hidden');
  });

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password-change').value;
    passwordError.classList.add('hidden');
    passwordSuccess.classList.add('hidden');

    try {
      const res = await fetch('/users/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to update password');

      passwordSuccess.textContent = 'Password updated successfully';
      passwordSuccess.classList.remove('hidden');
      passwordForm.reset();
    } catch (err) {
      passwordError.textContent = err.message;
      passwordError.classList.remove('hidden');
    }
  });

  // --- PLC DETAIL VIEW LOGIC ---
  backToDashboardBtn.addEventListener('click', () => {
    graphIntervals.forEach(clearInterval);
    graphIntervals = [];
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    plcDetailView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
  });

  window.managePlc = async function(deviceId) {
    currentPlcId = deviceId;
    dashboardView.classList.add('hidden');
    plcDetailView.classList.remove('hidden');
    
    graphIntervals.forEach(clearInterval);
    graphIntervals = [];
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};
    plcCommandsContainer.innerHTML = '';
    plcGraphsContainer.innerHTML = '';
    
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load device');
      const device = await res.json();
      plcDetailTitle.textContent = `${device.name} Dashboard`;
      
      if (device.ui_configuration && device.ui_configuration.views) {
        currentViews = device.ui_configuration.views;
      } else {
        currentViews = [{
          id: 'default',
          name: 'Main View',
          background: null,
          widgets: device.ui_configuration || []
        }];
      }
      activeViewId = currentViews[0].id;

      // Access Control Logic
      const isCreator = device.creator_id === userId;
      const canEdit = isCreator || device.allow_all_edit;

      if (!canEdit) {
        toggleLockBtn.style.display = 'none';
        plcTopNav.style.display = 'none';
        isLayoutLocked = true;
      } else {
        toggleLockBtn.style.display = 'block';
        plcTopNav.style.display = 'none';
        isLayoutLocked = true; // start locked for safety
        toggleLockBtn.textContent = '⚙️ Edit Mode';
      }

      if (isCreator) {
        toggleAccessBtn.classList.remove('hidden');
        toggleAccessBtn.textContent = device.allow_all_edit ? '🔓 Allow Others to Edit Layout' : '🔒 Restrict Edits to Me';
        toggleAccessBtn.onclick = async () => {
          const newAccess = !device.allow_all_edit;
          try {
            const patchRes = await fetch(`/api/devices/${deviceId}/access`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ allow_all_edit: newAccess })
            });
            if (patchRes.ok) {
              device.allow_all_edit = newAccess;
              toggleAccessBtn.textContent = newAccess ? '🔓 Allow Others to Edit Layout' : '🔒 Restrict Edits to Me';
            }
          } catch (e) {
            console.error('Failed to update access', e);
          }
        };
      } else {
        toggleAccessBtn.classList.add('hidden');
      }

      renderViewsTabs();
      renderPlcDashboard();
    } catch (err) {
      console.error(err);
      alert('Failed to load PLC details');
    }
  };

  toggleLockBtn.addEventListener('click', () => {
    isLayoutLocked = !isLayoutLocked;
    toggleLockBtn.textContent = isLayoutLocked ? '⚙️ Edit Mode' : '🔒 Lock Layout';
    
    if (!isLayoutLocked) {
      plcTopNav.style.display = 'flex';
      plcTopNav.classList.remove('hidden');
    } else {
      plcTopNav.style.display = 'none';
      plcTopNav.classList.add('hidden');
    }

    renderViewsTabs();
    renderPlcDashboard();
  });

  async function savePlcConfig() {
    try {
      await fetch(`/api/devices/${currentPlcId}/ui`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ui_configuration: { views: currentViews } })
      });
    } catch (err) {
      console.error('Failed to save config', err);
    }
  }

  function renderViewsTabs() {
    viewsTabsContainer.innerHTML = '';
    currentViews.forEach(view => {
      const btn = document.createElement('button');
      btn.className = `btn ${view.id === activeViewId ? 'btn-primary' : 'btn-neutral'}`;
      btn.textContent = view.name;
      btn.onclick = () => {
        activeViewId = view.id;
        renderViewsTabs();
        renderPlcDashboard();
      };
      viewsTabsContainer.appendChild(btn);
    });

    if (!isLayoutLocked) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-success';
      addBtn.textContent = '+ Add View';
      addBtn.onclick = () => {
        const name = prompt('Enter View Name:');
        if (name) {
          const id = 'view_' + Date.now();
          currentViews.push({ id, name, background: null, widgets: [] });
          activeViewId = id;
          savePlcConfig();
          renderViewsTabs();
          renderPlcDashboard();
        }
      };
      viewsTabsContainer.appendChild(addBtn);
    }
  }

  function getActiveView() {
    return currentViews.find(v => v.id === activeViewId) || currentViews[0];
  }

  function renderPlcDashboard() {
    const activeView = getActiveView();
    
    plcCommandsContainer.innerHTML = '';
    plcGraphsContainer.innerHTML = '';
    plcCommandsContainer.className = isLayoutLocked ? 'hmi-canvas' : 'hmi-canvas unlocked';
    
    // Set background image
    if (activeView.background) {
      plcCommandsContainer.style.backgroundImage = `url(${activeView.background})`;
      plcCommandsContainer.style.backgroundPosition = (activeView.bgPosX !== undefined && activeView.bgPosY !== undefined) 
        ? `${activeView.bgPosX}px ${activeView.bgPosY}px` 
        : 'center';
    } else {
      plcCommandsContainer.style.backgroundImage = 'none';
    }
    
    graphIntervals.forEach(clearInterval);
    graphIntervals = [];
    Object.values(chartInstances).forEach(chart => chart.destroy());
    chartInstances = {};

    const widgets = activeView.widgets || [];
    widgets.forEach((widget, index) => {
      if (widget.type === 'button') {
        const btn = document.createElement('button');
        btn.className = `btn ${widget.color} draggable-btn`;
        if (!isLayoutLocked) btn.classList.add('unlocked');
        btn.textContent = widget.label;
        if (widget.textColor) btn.style.setProperty('color', widget.textColor, 'important');
        if (widget.bgColor) btn.style.setProperty('background', widget.bgColor, 'important');
        btn.setAttribute('data-index', index);
        if (widget.width) btn.style.width = widget.width + 'px';
        if (widget.height) btn.style.height = widget.height + 'px';
        if (!isLayoutLocked) { btn.style.resize = 'both'; btn.style.overflow = 'hidden'; } else { btn.style.resize = 'none'; btn.style.overflow = 'visible'; }
        
        btn.style.left = (widget.x || 0) + 'px';
        btn.style.top = (widget.y || 0) + 'px';
        
        const delBtn = document.createElement('span');
        delBtn.innerHTML = '&times;';
        delBtn.style.cssText = 'position: absolute; top: -5px; right: -5px; background: red; color: white; border-radius: 50%; width: 15px; height: 15px; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
        if (isLayoutLocked) delBtn.style.display = 'none';

        delBtn.onclick = (e) => {
          e.stopPropagation();
          saveHistory();
          activeView.widgets.splice(index, 1);
          savePlcConfig();
          renderPlcDashboard();
        };
        btn.appendChild(delBtn);

        // Settings Button for Button Widget
        const settingsBtn = document.createElement('span');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.style.cssText = 'position: absolute; top: -5px; left: -5px; background: #333; border: 1px solid #555; border-radius: 50%; width: 15px; height: 15px; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
        if (isLayoutLocked) settingsBtn.style.display = 'none';
        settingsBtn.onclick = (e) => {
          e.stopPropagation();
          openSettingsModal(widget);
        };
        btn.appendChild(settingsBtn);

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        btn.addEventListener('mousedown', (e) => {
          if (isLayoutLocked || e.target === delBtn || e.target === settingsBtn) return;
          if (e.offsetX > btn.offsetWidth - 15 && e.offsetY > btn.offsetHeight - 15) return; // skip drag for resize
          saveHistory();
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          initialLeft = widget.x || 0;
          initialTop = widget.y || 0;
          e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          btn.style.left = (initialLeft + dx) + 'px';
          btn.style.top = (initialTop + dy) + 'px';
        });

        window.addEventListener('mouseup', (e) => {
          if (!isDragging) return;
          isDragging = false;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          widget.x = Math.max(0, initialLeft + dx);
          widget.y = Math.max(0, initialTop + dy);
          
          btn.style.left = widget.x + 'px';
          btn.style.top = widget.y + 'px';
          savePlcConfig();
        });

        btn.onclick = async (e) => {
          if (!isLayoutLocked || e.target === delBtn || e.target === settingsBtn) return;
          try {
            const res = await fetch(`/api/devices/${currentPlcId}/command`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ command: widget.payload })
            });
            if (!res.ok) throw new Error('Failed to send command');
            alert('Command sent successfully!');
          } catch (err) {
            alert(err.message);
          }
        };
        plcCommandsContainer.appendChild(btn);
      } else if (widget.type === 'slider') {
        const wrapper = document.createElement('div');
        wrapper.className = 'bordered-panel draggable-btn';
        if (!isLayoutLocked) wrapper.classList.add('unlocked');
        wrapper.style.padding = '10px 20px';
        wrapper.style.minWidth = '200px';
        if (widget.width) wrapper.style.width = widget.width + 'px';
        if (widget.height) wrapper.style.height = widget.height + 'px';
        wrapper.style.background = 'var(--panel-bg)';
        wrapper.style.left = (widget.x || 0) + 'px';
        wrapper.style.top = (widget.y || 0) + 'px';
        wrapper.setAttribute('data-index', index);
        if (!isLayoutLocked) { wrapper.style.resize = 'both'; wrapper.style.overflow = 'hidden'; } else { wrapper.style.resize = 'none'; wrapper.style.overflow = 'visible'; }
        
        const label = document.createElement('div');
        label.style.display = 'flex';
        label.style.justifyContent = 'space-between';
        label.style.marginBottom = '8px';
        label.style.fontSize = '0.9rem';
        label.innerHTML = `<strong>${widget.label}</strong><span class="${widget.color}">${widget.min}</span>`;
        wrapper.appendChild(label);

        const valSpan = label.querySelector('span');
        
        const input = document.createElement('input');
        input.type = 'range';
        input.min = widget.min;
        input.max = widget.max;
        input.step = widget.step;
        input.value = widget.min; // Default
        input.style.width = '100%';
        wrapper.appendChild(input);

        const delBtn = document.createElement('span');
        delBtn.innerHTML = '&times;';
        delBtn.style.cssText = 'position: absolute; top: -5px; right: -5px; background: red; color: white; border-radius: 50%; width: 15px; height: 15px; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
        if (isLayoutLocked) delBtn.style.display = 'none';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          saveHistory();
          activeView.widgets.splice(index, 1);
          savePlcConfig();
          renderPlcDashboard();
        };
        wrapper.appendChild(delBtn);

        // Settings Button for Slider Widget
        const settingsBtn = document.createElement('span');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.style.cssText = 'position: absolute; top: -5px; left: -5px; background: #333; border: 1px solid #555; border-radius: 50%; width: 15px; height: 15px; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
        if (isLayoutLocked) settingsBtn.style.display = 'none';
        settingsBtn.onclick = (e) => {
          e.stopPropagation();
          openSettingsModal(widget);
        };
        wrapper.appendChild(settingsBtn);

        // Value update
        input.addEventListener('input', () => {
          valSpan.textContent = input.value;
        });

        // Drag logic
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        wrapper.addEventListener('mousedown', (e) => {
          if (isLayoutLocked || e.target === delBtn || e.target === settingsBtn || e.target === input) return;
          if (e.offsetX > wrapper.offsetWidth - 15 && e.offsetY > wrapper.offsetHeight - 15) return; // skip drag for resize
          saveHistory();
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          initialLeft = widget.x || 0;
          initialTop = widget.y || 0;
          e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          wrapper.style.left = (initialLeft + dx) + 'px';
          wrapper.style.top = (initialTop + dy) + 'px';
        });

        window.addEventListener('mouseup', (e) => {
          if (!isDragging) return;
          isDragging = false;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          widget.x = Math.max(0, initialLeft + dx);
          widget.y = Math.max(0, initialTop + dy);
          wrapper.style.left = widget.x + 'px';
          wrapper.style.top = widget.y + 'px';
          savePlcConfig();
        });

        // Execution logic (Send command)
        input.addEventListener('change', async () => {
          if (!isLayoutLocked) return;
          const payload = {};
          payload[widget.payloadKey] = Number(input.value);
          
          try {
            const res = await fetch(`/api/devices/${currentPlcId}/command`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ command: JSON.stringify(payload) })
            });
            if (!res.ok) throw new Error('Failed to send slider command');
          } catch (err) {
            alert(err.message);
          }
        });

        wrapper.onclick = (e) => {
          if (!isLayoutLocked || e.target === delBtn || e.target === settingsBtn) return;
          openGlobalGraph(widget.feature || widget.label);
        };
        wrapper.style.cursor = isLayoutLocked ? 'pointer' : 'default';
        plcCommandsContainer.appendChild(wrapper);
      } else if (widget.type === 'graph') {
        const wrapper = document.createElement('div');
        wrapper.className = 'bordered-panel';
        wrapper.style.position = 'relative';
        if (widget.width) wrapper.style.width = widget.width + 'px';
        if (widget.height) wrapper.style.height = widget.height + 'px';
        
        const title = document.createElement('h4');
        title.textContent = widget.label || `Feature: ${widget.feature}`;
        title.style.marginTop = '0';
        wrapper.appendChild(title);

        const delBtn = document.createElement('span');
        delBtn.innerHTML = '&times;';
        delBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; background: red; color: white; border-radius: 50%; width: 20px; height: 20px; font-size: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
        if (isLayoutLocked) delBtn.style.display = 'none';
        delBtn.onclick = () => {
          saveHistory();
          activeView.widgets.splice(index, 1);
          savePlcConfig();
          renderPlcDashboard();
        };
        wrapper.appendChild(delBtn);

        // Settings Button for Graph
        const settingsBtn = document.createElement('span');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.style.cssText = 'position: absolute; top: 10px; right: 35px; background: #333; border: 1px solid #555; border-radius: 50%; width: 20px; height: 20px; font-size: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
        if (isLayoutLocked) settingsBtn.style.display = 'none';
        settingsBtn.onclick = () => {
          openSettingsModal(widget);
        };
        wrapper.appendChild(settingsBtn);

        const canvasContainer = document.createElement('div');
        // Subtract title height approximately to avoid overflow
        canvasContainer.style.height = 'calc(100% - 30px)';
        if (!widget.height) canvasContainer.style.height = '250px';
        canvasContainer.style.width = '100%';
        canvasContainer.style.position = 'relative';
        const canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);
        wrapper.appendChild(canvasContainer);
        plcGraphsContainer.appendChild(wrapper);

        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [{
              label: widget.feature,
              data: [],
              borderColor: widget.color,
              backgroundColor: widget.color + '33',
              borderWidth: 2,
              pointRadius: 2,
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
              legend: { labels: { color: '#e0e0e0' } },
              zoom: {
                pan: {
                  enabled: true,
                  mode: 'x'
                },
                zoom: {
                  wheel: {
                    enabled: true,
                  },
                  pinch: {
                    enabled: true
                  },
                  mode: 'x'
                }
              }
            },
            scales: {
              x: { ticks: { color: '#b0b0b0', maxTicksLimit: 8, maxRotation: 45, minRotation: 45 }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { ticks: { color: '#b0b0b0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
          }
        });
        chartInstances[index] = chart;

        const fetchData = async () => {
          try {
            const res = await fetch(`/api/telemetry/${currentPlcId}?feature=${encodeURIComponent(widget.feature)}&limit=${widget.limit}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              const data = await res.json();
              chart.data.labels = data.map(row => new Date(row.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
              chart.data.datasets[0].data = data.map(row => row.value);
              chart.update('none');
            }
          } catch (e) { console.error(e); }
        };
        fetchData();
        graphIntervals.push(setInterval(fetchData, 2000));
      } else if (widget.type === 'display') {
        const wrapper = document.createElement('div');
        wrapper.className = 'draggable-btn';
        if (!isLayoutLocked) wrapper.classList.add('unlocked');
        wrapper.style.left = (widget.x || 0) + 'px';
        wrapper.style.top = (widget.y || 0) + 'px';
        wrapper.setAttribute('data-index', index);
        if (!isLayoutLocked) { wrapper.style.resize = 'both'; wrapper.style.overflow = 'hidden'; } else { wrapper.style.resize = 'none'; wrapper.style.overflow = 'visible'; }
        wrapper.style.width = (widget.width || 150) + 'px';
        wrapper.style.height = (widget.height || 50) + 'px';
        wrapper.style.background = widget.bgColor || 'rgba(0, 0, 0, 0.7)';
        wrapper.style.color = widget.textColor || '#00ffcc';
        wrapper.style.border = '1px solid #00ffcc';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
        wrapper.style.borderRadius = '5px';
        wrapper.style.position = 'absolute';
        wrapper.style.padding = '5px';
        wrapper.setAttribute('data-index', index);
        if (!isLayoutLocked) { wrapper.style.resize = 'both'; wrapper.style.overflow = 'hidden'; } else { wrapper.style.resize = 'none'; wrapper.style.overflow = 'visible'; }
        
        const labelEl = document.createElement('div');
        labelEl.style.fontSize = '0.8rem';
        labelEl.style.color = '#ccc';
        labelEl.textContent = widget.label || widget.feature;
        wrapper.appendChild(labelEl);

        const valueEl = document.createElement('div');
        valueEl.style.fontSize = '1.2rem';
        valueEl.style.fontWeight = 'bold';
        valueEl.textContent = '---';
        wrapper.appendChild(valueEl);

        const delBtn = document.createElement('span');
        delBtn.innerHTML = '&times;';
        delBtn.style.cssText = 'position: absolute; top: -5px; right: -5px; background: red; color: white; border-radius: 50%; width: 15px; height: 15px; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
        if (isLayoutLocked) delBtn.style.display = 'none';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          saveHistory();
          activeView.widgets.splice(index, 1);
          savePlcConfig();
          renderPlcDashboard();
        };
        wrapper.appendChild(delBtn);

        // Settings Button
        const settingsBtn = document.createElement('span');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.style.cssText = 'position: absolute; top: -5px; left: -5px; background: #333; border: 1px solid #555; border-radius: 50%; width: 15px; height: 15px; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;';
        if (isLayoutLocked) settingsBtn.style.display = 'none';
        settingsBtn.onclick = (e) => {
          e.stopPropagation();
          openSettingsModal(widget);
        };
        wrapper.appendChild(settingsBtn);

        // Dragging Logic
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        wrapper.addEventListener('mousedown', (e) => {
          if (isLayoutLocked || e.target === delBtn || e.target === settingsBtn) return;
          if (e.offsetX > wrapper.offsetWidth - 15 && e.offsetY > wrapper.offsetHeight - 15) return; // skip drag for resize
          saveHistory();
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          initialLeft = widget.x || 0;
          initialTop = widget.y || 0;
          e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          wrapper.style.left = (initialLeft + (e.clientX - startX)) + 'px';
          wrapper.style.top = (initialTop + (e.clientY - startY)) + 'px';
        });
        window.addEventListener('mouseup', (e) => {
          if (!isDragging) return;
          isDragging = false;
          widget.x = Math.max(0, initialLeft + (e.clientX - startX));
          widget.y = Math.max(0, initialTop + (e.clientY - startY));
          wrapper.style.left = widget.x + 'px';
          wrapper.style.top = widget.y + 'px';
          savePlcConfig();
        });

        // Click to open graph (only when layout is locked / view mode)
        wrapper.style.cursor = isLayoutLocked ? 'pointer' : 'default';
        if (isLayoutLocked) {
          wrapper.addEventListener('click', (e) => {
            if (e.target === delBtn || e.target === settingsBtn) return;
            openGlobalGraph(widget.feature || widget.label);
          });
        }

        plcCommandsContainer.appendChild(wrapper);

        // Polling telemetry
        const fetchData = async () => {
          try {
            const res = await fetch(`/api/telemetry/${currentPlcId}?feature=${encodeURIComponent(widget.feature)}&limit=1`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              const data = await res.json();
              if (data.length > 0) {
                valueEl.textContent = data[0].value;
              }
            }
          } catch (e) { console.error(e); }
        };
        fetchData();
        graphIntervals.push(setInterval(fetchData, 2000));
      }
    });
  }

  // Modals logic for Dashboard widgets
  const addGraphModal = document.getElementById('add-graph-modal');
  const addGraphForm = document.getElementById('add-graph-form');
  const graphFeatureSelect = document.getElementById('graph-feature');

  if (showAddGraphBtn) {
    showAddGraphBtn.addEventListener('click', async () => {
    addGraphForm.reset();
    graphFeatureSelect.innerHTML = '<option value="">Loading...</option>';
    addGraphModal.classList.remove('hidden');
    
    try {
      const res = await fetch(`/api/telemetry/${currentPlcId}/features`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const features = await res.json();
      graphFeatureSelect.innerHTML = '';
      if (features.length === 0) {
        graphFeatureSelect.innerHTML = '<option value="">No data yet</option>';
      } else {
        features.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f;
          opt.textContent = f;
          graphFeatureSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.error(e);
      graphFeatureSelect.innerHTML = '<option value="">Error loading</option>';
    }
  });

  document.getElementById('close-graph-modal').addEventListener('click', () => {
    addGraphModal.classList.add('hidden');
  });

  addGraphForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const feature = document.getElementById('graph-feature').value;
    if (!feature) return alert('No feature selected');
    
    const color = document.getElementById('graph-color').value;
    const limit = document.getElementById('graph-limit').value;
    
    const activeView = getActiveView();
    saveHistory();
    activeView.widgets.push({ type: 'graph', feature, color: '#00ffcc', limit: 50, x: 100, y: 100, width: 300, height: 250 });
    savePlcConfig();
    renderPlcDashboard();
    addGraphModal.classList.add('hidden');
  });
}

  const addCmdBtnModal = document.getElementById('add-cmd-btn-modal');
  const addCmdBtnForm = document.getElementById('add-cmd-btn-form');

  showAddCmdBtn.addEventListener('click', () => {
    addCmdBtnForm.reset();
    addCmdBtnModal.classList.remove('hidden');
  });

  document.getElementById('close-cmd-btn-modal').addEventListener('click', () => {
    addCmdBtnModal.classList.add('hidden');
  });

  addCmdBtnForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = document.getElementById('cmd-btn-label').value;
    const color = document.getElementById('cmd-btn-color').value;
    const payload = document.getElementById('cmd-btn-payload').value;
    
    // Validate JSON
    try {
      JSON.parse(payload);
    } catch(err) {
      if (!payload.trim().startsWith('{')) {
        // Allow plain text if not JSON
      } else {
        return alert('Invalid JSON payload');
      }
    }

    const activeView = getActiveView();
    saveHistory();
    activeView.widgets.push({ type: 'button', label, color, payload, x: 0, y: 0 });
    savePlcConfig();
    renderPlcDashboard();
    addCmdBtnModal.classList.add('hidden');
  });

  // Slider Modal Logic
  const addSliderModal = document.getElementById('add-slider-modal');
  const addSliderForm = document.getElementById('add-slider-form');
  const showAddSliderBtn = document.getElementById('show-add-slider-btn');

  showAddSliderBtn.addEventListener('click', () => {
    addSliderForm.reset();
    addSliderModal.classList.remove('hidden');
  });

  document.getElementById('close-slider-modal').addEventListener('click', () => {
    addSliderModal.classList.add('hidden');
  });

  addSliderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = document.getElementById('slider-label').value;
    const min = Number(document.getElementById('slider-min').value);
    const max = Number(document.getElementById('slider-max').value);
    const step = Number(document.getElementById('slider-step').value);
    const payloadKey = document.getElementById('slider-key').value;
    const color = document.getElementById('slider-color').value;

    const activeView = getActiveView();
    activeView.widgets.push({ 
      type: 'slider', 
      label, 
      min: parseFloat(min), 
      max: parseFloat(max), 
      step: parseFloat(step), 
      payloadKey: payloadKey, 
      color, 
      x: 0, 
      y: 0 
    });
    
    savePlcConfig();
    renderPlcDashboard();
    addSliderModal.classList.add('hidden');
  });

  async function fetchUsers() {
    try {
      const res = await fetch('/users', {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!res.ok) return; // ignore if engineer
      const users = await res.json();
      renderUsers(users);
      
      // Initialize or update Map with the users data
      if (typeof initMap === 'function') {
        try {
          initMap(users);
        } catch (err) {
          console.error("Map initialization error:", err);
        }
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }

  window.toggleUserStatus = async function(id, targetRole, isActive) {
    if (!confirm(`Are you sure you want to ${isActive ? 'deactivate' : 'activate'} this user?`)) return;

    const endpoint = targetRole === 'Manager' ? `/users/manager/${id}` : `/users/engineer/${id}`;
    const url = isActive ? endpoint : `${endpoint}/activate`;
    const method = isActive ? 'DELETE' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchUsers();
        if (userRole === 'Super Admin') fetchAuditLogs();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update user status');
      }
    } catch (err) {
      console.error(err);
    }
  };

  window.hardDeleteUser = async function(id, targetRole) {
    if (!confirm('Are you absolutely sure you want to permanently delete this user? This cannot be undone.')) return;

    const endpoint = targetRole === 'Manager' ? `/users/manager/${id}/hard` : `/users/engineer/${id}/hard`;

    try {
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchUsers();
        if (userRole === 'Super Admin') fetchAuditLogs();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (err) {
      console.error(err);
    }
  };

  function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';

    if (userRole === 'Super Admin') {
      // === Hierarchical View: Group engineers under their managers ===
      const managers = users.filter(u => u.role === 'Manager');
      const engineers = users.filter(u => u.role === 'Engineer');

      managers.forEach(mgr => {
        const mgrStatusClass = mgr.is_active ? 'badge-success' : 'badge-danger';
        const mgrStatusText = mgr.is_active ? 'Active' : 'Deactivated';
        const mgrToggleText = mgr.is_active ? 'Deactivate' : 'Activate';
        const mgrToggleClass = mgr.is_active ? 'btn-danger-outline' : 'btn-success';

        // Get engineers belonging to this manager's site
        const siteEngineers = engineers.filter(e => e.site_id === mgr.site_id);

        // Manager header row (clickable to expand/collapse)
        const mgrRow = document.createElement('tr');
        mgrRow.style.cssText = 'background: rgba(68, 138, 255, 0.08); cursor: pointer; border-left: 3px solid #448aff;';
        mgrRow.innerHTML = `
          <td><span style="font-size: 0.9rem; margin-right: 6px;" id="chevron-${mgr.id}">▶</span> ${mgr.id}</td>
          <td><strong style="color: #80b0ff;">👤 ${mgr.username}</strong></td>
          <td><span class="badge" style="background: rgba(68, 138, 255, 0.25); color: #80b0ff;">Manager</span></td>
          <td>Site ${mgr.site_id}</td>
          <td><span class="badge ${mgrStatusClass}">${mgrStatusText}</span></td>
          <td>
            <button class="btn ${mgrToggleClass}" onclick="event.stopPropagation(); toggleUserStatus(${mgr.id}, 'Manager', ${mgr.is_active})" style="margin-right: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem;">${mgrToggleText}</button>
            <button class="btn btn-warning" onclick="event.stopPropagation(); showReplaceManagerModal(${mgr.id})" style="margin-right: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem;">Replace</button>
            <button class="btn btn-danger-outline" onclick="event.stopPropagation(); hardDeleteUser(${mgr.id}, 'Manager')" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Delete</button>
          </td>
        `;
        tbody.appendChild(mgrRow);

        // Engineer rows (hidden by default, toggled by clicking the manager row)
        const engineerRows = [];
        if (siteEngineers.length === 0) {
          const emptyRow = document.createElement('tr');
          emptyRow.className = `eng-group-${mgr.id}`;
          emptyRow.style.display = 'none';
          emptyRow.innerHTML = `<td colspan="6" style="padding-left: 40px; color: #667; font-style: italic;">No engineers assigned to this site yet.</td>`;
          tbody.appendChild(emptyRow);
          engineerRows.push(emptyRow);
        } else {
          siteEngineers.forEach(eng => {
            const engStatusClass = eng.is_active ? 'badge-success' : 'badge-danger';
            const engStatusText = eng.is_active ? 'Active' : 'Deactivated';
            const engToggleText = eng.is_active ? 'Deactivate' : 'Activate';
            const engToggleClass = eng.is_active ? 'btn-danger-outline' : 'btn-success';

            const engRow = document.createElement('tr');
            engRow.className = `eng-group-${mgr.id}`;
            engRow.style.cssText = 'display: none; background: rgba(0,230,118,0.03); border-left: 3px solid rgba(0,230,118,0.3);';
            engRow.innerHTML = `
              <td style="padding-left: 40px;">${eng.id}</td>
              <td>⚙️ ${eng.username}</td>
              <td><span class="badge" style="background: rgba(0,230,118,0.15); color: #00e676;">Engineer</span></td>
              <td>Site ${eng.site_id}</td>
              <td><span class="badge ${engStatusClass}">${engStatusText}</span></td>
              <td>
                <button class="btn ${engToggleClass}" onclick="toggleUserStatus(${eng.id}, 'Engineer', ${eng.is_active})" style="margin-right: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem;">${engToggleText}</button>
                <button class="btn btn-danger-outline" onclick="hardDeleteUser(${eng.id}, 'Engineer')" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Delete</button>
              </td>
            `;
            tbody.appendChild(engRow);
            engineerRows.push(engRow);
          });
        }

        // Count badge on manager row
        const countBadge = document.createElement('span');
        countBadge.style.cssText = 'margin-left: 6px; background: rgba(255,255,255,0.1); padding: 1px 7px; border-radius: 10px; font-size: 0.75rem; color: #8899bb;';
        countBadge.textContent = `${siteEngineers.length} engineer${siteEngineers.length !== 1 ? 's' : ''}`;
        mgrRow.querySelector('td:nth-child(2) strong').appendChild(countBadge);

        // Toggle expand/collapse on manager row click
        let expanded = false;
        mgrRow.addEventListener('click', () => {
          expanded = !expanded;
          const chevron = document.getElementById(`chevron-${mgr.id}`);
          chevron.textContent = expanded ? '▼' : '▶';
          const rows = tbody.querySelectorAll(`.eng-group-${mgr.id}`);
          rows.forEach(r => r.style.display = expanded ? '' : 'none');
        });
      });

    } else {
      // === Manager / flat view: just show their engineers ===
      users.forEach(u => {
        const tr = document.createElement('tr');
        const statusClass = u.is_active ? 'badge-success' : 'badge-danger';
        const statusText = u.is_active ? 'Active' : 'Deactivated';
        const toggleBtnText = u.is_active ? 'Deactivate' : 'Activate';
        const toggleBtnClass = u.is_active ? 'btn-danger-outline' : 'btn-success';

        tr.innerHTML = `
          <td>${u.id}</td>
          <td><strong>⚙️ ${u.username}</strong></td>
          <td><span class="badge" style="background: rgba(0,230,118,0.15); color: #00e676;">${u.role}</span></td>
          <td>Site ${u.site_id}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
          <td>
            <button class="btn ${toggleBtnClass}" onclick="toggleUserStatus(${u.id}, '${u.role}', ${u.is_active})" style="margin-right: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem;">${toggleBtnText}</button>
            <button class="btn btn-danger-outline" onclick="hardDeleteUser(${u.id}, '${u.role}')" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  // Personnel Management
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', () => {
      fetchUsers();
    });
  }

  showAddUserBtn.addEventListener('click', () => {
    // If Super Admin, direct to use Globe instead
    if (userRole === 'Super Admin') {
      alert("Please use the Global Operations Map to deploy a new Manager by clicking on a location.");
      return;
    }
    addUserPanel.classList.remove('hidden');
    addUserError.classList.add('hidden');
  });

  cancelAddUserBtn.addEventListener('click', () => {
    addUserPanel.classList.add('hidden');
    addUserForm.reset();
  });

  addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('new-username').value;
    const newPassword = document.getElementById('new-password').value;
    const newSite = document.getElementById('new-site').value;

    let endpoint = '';
    const payload = {
        username: newUsername,
        password: newPassword,
        email: document.getElementById('new-email').value
    };
    if (userRole === 'Super Admin') {
      endpoint = '/users/manager';
      payload.site_id = newSite;
    } else if (userRole === 'Manager') {
      endpoint = '/users/engineer';
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      
      addUserPanel.classList.add('hidden');
      addUserForm.reset();
      
      alert(`Successfully onboarded ${newUsername}!`);
      
      fetchUsers();
      if (userRole === 'Super Admin') fetchAuditLogs();
      
    } catch (err) {
      addUserError.textContent = err.message;
      addUserError.classList.remove('hidden');
    }
  });

  // Replace Manager Modal Logic
  const replaceManagerModal = document.getElementById('replace-manager-modal');
  const replaceManagerForm = document.getElementById('replace-manager-form');

  window.showReplaceManagerModal = function(id) {
    document.getElementById('replace-target-id').value = id;
    replaceManagerModal.classList.remove('hidden');
  };

  document.getElementById('close-replace-modal').addEventListener('click', () => {
    replaceManagerModal.classList.add('hidden');
    replaceManagerForm.reset();
  });

  replaceManagerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('replace-target-id').value;
    
    const payload = {
        newUsername: document.getElementById('replace-username').value,
        newPassword: document.getElementById('replace-password').value,
        newEmail: document.getElementById('replace-email').value
    };

    try {
      const res = await fetch(`/users/manager/${id}/replace`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to replace manager');
      
      replaceManagerModal.classList.add('hidden');
      replaceManagerForm.reset();
      alert(data.message);
      
      fetchUsers();
      fetchAuditLogs();
    } catch (err) {
      alert(err.message);
    }
  });

  // Audit Logs
  refreshLogsBtn.addEventListener('click', fetchAuditLogs);

  async function fetchAuditLogs() {
    try {
      const res = await fetch('/audit-logs', {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Failed to fetch logs');
      
      const logs = await res.json();
      renderAuditLogs(logs);
    } catch (err) {
      console.error(err);
    }
  }

  function renderAuditLogs(logs) {
    auditLogsTbody.innerHTML = '';
    logs.forEach(log => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      const date = new Date(log.timestamp).toLocaleString();
      tr.innerHTML = `
        <td>${date}</td>
        <td><strong>${log.actor}</strong></td>
        <td><span class="badge" style="background: rgba(0,230,118,0.1); color: var(--accent-active); border: none;">${log.action_type}</span></td>
        <td>${log.target_id}</td>
      `;
      
      const detailTr = document.createElement('tr');
      detailTr.classList.add('hidden');
      detailTr.innerHTML = `
        <td colspan="4" style="padding: 0;">
          <div style="padding: 1rem; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border-color);">
            <pre style="margin: 0; color: #a9a9a9; font-size: 0.85rem;">${JSON.stringify(log.details, null, 2)}</pre>
          </div>
        </td>
      `;

      tr.addEventListener('click', () => {
        detailTr.classList.toggle('hidden');
      });

      auditLogsTbody.appendChild(tr);
      auditLogsTbody.appendChild(detailTr);
    });
  }

  // Display Widget Logic
  showAddDisplayBtn.addEventListener('click', () => {
    const feature = prompt('Enter the Telemetry Variable this should display (e.g., temperature):');
    if (feature) {
      const activeView = getActiveView();
      activeView.widgets.push({
        type: 'display',
        feature: feature,
        label: feature,
        x: 50,
        y: 50,
        width: 150,
        height: 60
      });
      savePlcConfig();
      renderPlcDashboard();
    }
  });

  // Background Upload Logic
  uploadBgInput.addEventListener('change', async (e) => {
    if (!e.target.files.length) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('background', file);

    try {
      const res = await fetch(`/api/devices/${currentPlcId}/background`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const activeView = getActiveView();
      activeView.background = data.url;
      savePlcConfig();
      renderPlcDashboard();
    } catch (err) {
      alert('Background upload failed');
    }
  });

  // Settings Modal Logic
  function openSettingsModal(widget) {
    currentEditingWidget = widget;
    document.getElementById('widget-setting-width').value = widget.width || '';
    document.getElementById('widget-setting-height').value = widget.height || '';
    document.getElementById('widget-setting-label').value = widget.label || widget.feature || '';
    document.getElementById('widget-setting-key').value = widget.payload || widget.feature || '';
    widgetSettingsModal.classList.remove('hidden');
  }

  closeWidgetSettingsModal.addEventListener('click', () => {
    widgetSettingsModal.classList.add('hidden');
    currentEditingWidget = null;
  });

  widgetSettingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentEditingWidget) return;

    const w = document.getElementById('widget-setting-width').value;
    const h = document.getElementById('widget-setting-height').value;
    const lbl = document.getElementById('widget-setting-label').value;
    const key = document.getElementById('widget-setting-key').value;

    if (w) currentEditingWidget.width = parseInt(w, 10);
    if (h) currentEditingWidget.height = parseInt(h, 10);
    if (lbl) currentEditingWidget.label = lbl;
    
    if (currentEditingWidget.type === 'display' || currentEditingWidget.type === 'graph') {
      currentEditingWidget.feature = key;
    } else if (currentEditingWidget.type === 'button') {
      currentEditingWidget.payload = key;
    }

    savePlcConfig();
    renderPlcDashboard();
    widgetSettingsModal.classList.add('hidden');
    currentEditingWidget = null;
  });

  // ==========================================
  // MAP INTEGRATION (Self-contained Canvas Map)
  // ==========================================
  let mapInstance = null;
  const mapContainer = document.getElementById('map-container');
  const mapSection = document.getElementById('map-section');
  const createManagerModal = document.getElementById('create-manager-modal');
  const createManagerForm = document.getElementById('create-manager-form');

  window.initMap = function(users) {
    if (userRole !== 'Super Admin' || !mapContainer) return;
    
    // Ensure section is visible
    mapSection.classList.remove('hidden');

    // Delay to ensure layout is computed
    setTimeout(() => {
        try {
            if (!mapInstance) {
                mapInstance = new InteractiveWorldMap('map-container', {
                    onClick: function(lat, lng) {
                        document.getElementById('new-manager-lat').value = lat;
                        document.getElementById('new-manager-lng').value = lng;
                        document.getElementById('new-manager-coords').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                        createManagerModal.classList.remove('hidden');
                    }
                });
            }

            // Filter managers and set markers
            const managers = users.filter(u => u.role === 'Manager' && u.latitude != null && u.longitude != null);
            
            const markers = managers.map(m => ({
                lat: parseFloat(m.latitude),
                lng: parseFloat(m.longitude),
                active: m.is_active,
                label: `${m.username} (Site: ${m.site_id})`
            })).filter(m => !isNaN(m.lat) && !isNaN(m.lng));

            mapInstance.setMarkers(markers);

        } catch (err) {
            console.error("Map initialization error:", err);
        }
    }, 150);
  };

  // Handle map manager creation
  document.getElementById('close-create-manager-modal').addEventListener('click', () => {
    createManagerModal.classList.add('hidden');
    createManagerForm.reset();
  });

  createManagerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        site_id: document.getElementById('new-manager-site').value,
        username: document.getElementById('new-manager-username').value,
        password: document.getElementById('new-manager-password').value,
        email: document.getElementById('new-manager-email').value,
        latitude: parseFloat(document.getElementById('new-manager-lat').value),
        longitude: parseFloat(document.getElementById('new-manager-lng').value)
    };

    try {
      const res = await fetch('/users/manager', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to deploy manager');
      
      createManagerModal.classList.add('hidden');
      createManagerForm.reset();
      
      alert(`Successfully deployed ${payload.username} to Site ${payload.site_id}!`);
      
      fetchUsers();
      fetchAuditLogs();
      
    } catch (err) {
      alert(err.message);
    }
  });

  
  document.getElementById('undo-btn').addEventListener('click', () => {
    if (isLayoutLocked) return alert('Unlock layout to edit');
    if (undoStack.length > 0) {
      currentViews = undoStack.pop();
      savePlcConfig();
      renderViewsTabs();
      renderPlcDashboard();
    } else {
      alert('No actions to undo');
    }
  });

  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (isLayoutLocked) return alert('Unlock layout to edit');
    if (confirm('Are you sure you want to delete all widgets in this view?')) {
      saveHistory();
      getActiveView().widgets = [];
      savePlcConfig();
      renderPlcDashboard();
    }
  });

  
  // GLOBAL RESIZE DETECTOR
  window.addEventListener('mouseup', () => {
    if (isLayoutLocked) return;
    const activeView = getActiveView();
    if (!activeView || !activeView.widgets) return;
    
    let needsSave = false;
    let historySaved = false;
    
    Array.from(plcCommandsContainer.children).forEach(el => {
      const idx = el.getAttribute('data-index');
      if (idx !== null) {
        const widget = activeView.widgets[idx];
        if (widget) {
          const cw = el.offsetWidth;
          const ch = el.offsetHeight;
          if ((widget.width !== undefined && cw !== widget.width) || 
              (widget.height !== undefined && ch !== widget.height) ||
              (widget.width === undefined && cw > 0 && ch > 0)) { // first set
             
             if (widget.width !== undefined) { // only save history if it's a real resize, not initial set
               if (!historySaved) { saveHistory(); historySaved = true; }
             }
             widget.width = cw;
             widget.height = ch;
             needsSave = true;
          }
        }
      }
    });
    
    if (needsSave) savePlcConfig();
  });

  // Background Panning Logic
  plcCommandsContainer.addEventListener('mousedown', (e) => {
    if (isLayoutLocked || e.target !== plcCommandsContainer) return;
    const activeView = getActiveView();
    if (!activeView.background) return; // Only pan if there's an image

    isDraggingBg = true;
    bgStartX = e.clientX;
    bgStartY = e.clientY;
    
    // Parse current position if it exists, otherwise default to 0 for tracking offsets relative to center
    initialBgX = activeView.bgPosX || 0;
    initialBgY = activeView.bgPosY || 0;
    
    // If we were "center" before, panning will snap to 0,0 relative. That's fine for absolute pixel dragging.
    if (activeView.bgPosX === undefined) {
      // It was centered previously, but to make it draggable we start at 0,0 offset
      plcCommandsContainer.style.backgroundPosition = `0px 0px`;
    }
    
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingBg) return;
    const dx = e.clientX - bgStartX;
    const dy = e.clientY - bgStartY;
    const activeView = getActiveView();
    activeView.bgPosX = initialBgX + dx;
    activeView.bgPosY = initialBgY + dy;
    
    plcCommandsContainer.style.backgroundPosition = `${activeView.bgPosX}px ${activeView.bgPosY}px`;
  });

  window.addEventListener('mouseup', (e) => {
    if (!isDraggingBg) return;
    isDraggingBg = false;
    savePlcConfig();
  });

});
