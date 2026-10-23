document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  
  const userRoleBadge = document.getElementById('user-role-badge');
  const userNameEl = document.getElementById('logged-username');
  const logoutBtn = document.getElementById('logout-btn');
  
  const auditLogsSection = document.getElementById('audit-logs-section');
  const auditLogsTbody = document.getElementById('audit-logs-tbody');
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');

  const showAddUserBtn = document.getElementById('show-add-user-btn');
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
  const chartContainer = document.getElementById('chart-container');
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  let telemetryChartInstance = null;

  // State
  let token = localStorage.getItem('sf_token');
  let userRole = localStorage.getItem('sf_role');
  let userSite = localStorage.getItem('sf_site_id');
  let username = localStorage.getItem('sf_username');
  
  // Init
  if (token) {
    showDashboard();
  } else {
    showLogin();
  }

  // Auth Functions
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

      localStorage.setItem('sf_token', token);
      localStorage.setItem('sf_role', userRole);
      localStorage.setItem('sf_site_id', userSite);
      localStorage.setItem('sf_username', username);

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
    localStorage.clear();
    token = null;
    userRole = null;
    userSite = null;
    showLogin();
  });

  // UI Toggles
  function showLogin() {
    dashboardView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  function showDashboard() {
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

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ name })
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
      
      let actionsHtml = `<button class="btn btn-primary" onclick="viewTelemetry(${device.id}, '${device.name}')">View Graph</button>`;
      
      tr.innerHTML = `
        <td>${device.id}</td>
        <td>${device.name}</td>
        <td>${device.zone_id}</td>
        <td>${device.mqtt_topic_base}</td>
        <td>
          <button class="btn btn-warning" onclick="openCommandModal(${device.id})">Command</button>
          ${(userRole === 'Super Admin' || device.zone_id === siteId) 
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

  window.viewTelemetry = async function(deviceId, deviceName) {
    chartContainer.classList.remove('hidden');
    try {
      const res = await fetch(`/api/telemetry/${deviceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch telemetry');
      const data = await res.json();
      renderChart(data, deviceName);
    } catch (err) {
      console.error(err);
    }
  };

  function renderChart(data, deviceName) {
    if (telemetryChartInstance) {
      telemetryChartInstance.destroy();
    }

    const labels = data.map(row => new Date(row.time).toLocaleTimeString());
    const values = data.map(row => row.value);

    telemetryChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: `${deviceName} Telemetry`,
          data: values,
          borderColor: '#00e676',
          backgroundColor: 'rgba(0, 230, 118, 0.1)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#00e676',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#e0e0e0' } }
        },
        scales: {
          x: {
            ticks: { color: '#b0b0b0' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            ticks: { color: '#b0b0b0' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        }
      }
    });
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/users', {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!res.ok) return; // ignore if engineer
      const users = await res.json();
      renderUsers(users);
    } catch (error) {
      console.error(error);
      alert('Error updating user status');
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
    users.forEach(u => {
      const tr = document.createElement('tr');
      const statusClass = u.is_active ? 'badge-success' : 'badge-danger';
      const statusText = u.is_active ? 'Active' : 'Deactivated';
      
      let actionsHtml = '';
      if (userRole === 'Super Admin' || userRole === 'Manager') {
        const toggleBtnText = u.is_active ? 'Deactivate' : 'Activate';
        const toggleBtnClass = u.is_active ? 'btn-danger-outline' : 'btn-success';
        
        actionsHtml = `
          <button class="btn ${toggleBtnClass}" onclick="toggleUserStatus(${u.id}, '${u.role}', ${u.is_active})" style="margin-right: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem;">${toggleBtnText}</button>
          <button class="btn btn-danger-outline" onclick="hardDeleteUser(${u.id}, '${u.role}')" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Delete</button>
        `;
      }

      tr.innerHTML = `
        <td>${u.id}</td>
        <td><strong>${u.username}</strong></td>
        <td><span class="badge" style="background: rgba(255,255,255,0.1)">${u.role}</span></td>
        <td>${u.site_id || 'N/A'}</td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td>${actionsHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Personnel Management
  showAddUserBtn.addEventListener('click', () => {
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
      const date = new Date(log.timestamp).toLocaleString();
      tr.innerHTML = `
        <td>${date}</td>
        <td><strong>${log.actor}</strong></td>
        <td><span class="badge" style="background: rgba(0,230,118,0.1); color: var(--accent-active); border: none;">${log.action_type}</span></td>
        <td>${log.target_id}</td>
        <td>${JSON.stringify(log.details)}</td>
      `;
      auditLogsTbody.appendChild(tr);
    });
  }
});
