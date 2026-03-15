// Admin Dashboard Application
// Vanilla JS -- no build step, no frameworks

(function () {
  "use strict";

  // ─── State ──────────────────────────────────────────────────────────
  let accessToken = localStorage.getItem("accessToken") || null;
  let refreshToken = localStorage.getItem("refreshToken") || null;
  let currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");

  function saveAuth(user, access, refresh) {
    accessToken = access;
    refreshToken = refresh;
    currentUser = user;
    localStorage.setItem("accessToken", access);
    localStorage.setItem("refreshToken", refresh);
    localStorage.setItem("currentUser", JSON.stringify(user));
  }

  function clearAuth() {
    accessToken = null;
    refreshToken = null;
    currentUser = null;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("currentUser");
  }

  // ─── API Helper ─────────────────────────────────────────────────────
  async function api(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    if (accessToken) {
      headers["Authorization"] = "Bearer " + accessToken;
    }

    const opts = { method, headers };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    let res = await fetch(path, opts);

    // Handle 401 by attempting token refresh
    if (res.status === 401 && refreshToken) {
      const refreshRes = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refreshToken }),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        accessToken = data.accessToken;
        refreshToken = data.refreshToken;
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);

        // Retry original request with new token
        headers["Authorization"] = "Bearer " + accessToken;
        opts.headers = headers;
        res = await fetch(path, opts);
      } else {
        // Refresh failed -- redirect to login
        clearAuth();
        showLogin();
        throw new Error("Session expired. Please log in again.");
      }
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || "Request failed (" + res.status + ")");
    }

    return res.json();
  }

  // ─── View Management ───────────────────────────────────────────────
  function showLogin() {
    document.getElementById("login-view").style.display = "";
    document.getElementById("dashboard-view").style.display = "none";
    document.getElementById("login-error").textContent = "";
    document.getElementById("login-form").reset();
  }

  function showDashboard() {
    document.getElementById("login-view").style.display = "none";
    document.getElementById("dashboard-view").style.display = "";
    loadUsers();
  }

  // ─── Login ──────────────────────────────────────────────────────────
  document.getElementById("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      const data = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.message || d.error || "Login failed"); });
        return res.json();
      });

      if (data.user.role !== "ADMIN") {
        errorEl.textContent = "Access denied. Admin role required.";
        return;
      }

      saveAuth(data.user, data.accessToken, data.refreshToken);
      showDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // ─── Logout ─────────────────────────────────────────────────────────
  document.getElementById("logout-btn").addEventListener("click", async function () {
    try {
      await api("POST", "/api/v1/auth/logout", { refreshToken: refreshToken });
    } catch (_) {
      // Logout even if request fails
    }
    clearAuth();
    showLogin();
  });

  // ─── Tab Switching ──────────────────────────────────────────────────
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");

      var tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-section").forEach(function (s) { s.style.display = "none"; });
      document.getElementById(tab + "-section").style.display = "";

      if (tab === "users") loadUsers();
      if (tab === "invitations") loadInvitations();
    });
  });

  // ─── Users ──────────────────────────────────────────────────────────
  async function loadUsers() {
    try {
      var users = await api("GET", "/api/v1/admin/users");
      renderUsers(users);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  }

  function renderUsers(users) {
    var tbody = document.getElementById("users-tbody");
    tbody.innerHTML = "";

    users.forEach(function (user) {
      var tr = document.createElement("tr");

      var scopeText = (user.scopes || []).map(function (s) {
        return s.entityType + ":" + s.entityId;
      }).join(", ") || "None";

      var isActive = user.isActive !== false;
      var statusClass = isActive ? "badge-active" : "badge-inactive";
      var statusText = isActive ? "Active" : "Inactive";

      tr.innerHTML =
        "<td>" + escapeHtml(user.name || "") + "</td>" +
        "<td>" + escapeHtml(user.email) + "</td>" +
        "<td>" + escapeHtml(user.role) + "</td>" +
        "<td><span class=\"badge " + statusClass + "\">" + statusText + "</span></td>" +
        "<td>" + escapeHtml(scopeText) + "</td>" +
        "<td class=\"actions-cell\"></td>";

      var actionsCell = tr.querySelector(".actions-cell");

      // Deactivate / Reactivate
      if (isActive) {
        var deactivateBtn = document.createElement("button");
        deactivateBtn.textContent = "Deactivate";
        deactivateBtn.className = "btn-danger btn-sm";
        deactivateBtn.addEventListener("click", function () { deactivateUser(user.id); });
        actionsCell.appendChild(deactivateBtn);
      } else {
        var reactivateBtn = document.createElement("button");
        reactivateBtn.textContent = "Reactivate";
        reactivateBtn.className = "btn-success btn-sm";
        reactivateBtn.addEventListener("click", function () { reactivateUser(user.id); });
        actionsCell.appendChild(reactivateBtn);
      }

      // Edit button
      var editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.className = "btn-secondary btn-sm";
      editBtn.addEventListener("click", function () { openEditModal(user); });
      actionsCell.appendChild(editBtn);

      tbody.appendChild(tr);
    });
  }

  async function deactivateUser(userId) {
    try {
      await api("PATCH", "/api/v1/admin/users/" + userId + "/deactivate");
      loadUsers();
    } catch (err) {
      alert("Failed to deactivate user: " + err.message);
    }
  }

  async function reactivateUser(userId) {
    try {
      await api("PATCH", "/api/v1/admin/users/" + userId + "/reactivate");
      loadUsers();
    } catch (err) {
      alert("Failed to reactivate user: " + err.message);
    }
  }

  // ─── User Edit Modal ───────────────────────────────────────────────
  function openEditModal(user) {
    document.getElementById("edit-user-id").value = user.id;
    document.getElementById("edit-user-name").textContent = user.name || user.email;
    document.getElementById("edit-user-role").value = user.role;

    var scopesList = document.getElementById("scopes-list");
    scopesList.innerHTML = "";

    (user.scopes || []).forEach(function (scope) {
      addScopeRow(scope.entityType, scope.entityId);
    });

    document.getElementById("user-edit-modal").style.display = "";
  }

  function addScopeRow(entityType, entityId) {
    var scopesList = document.getElementById("scopes-list");
    var row = document.createElement("div");
    row.className = "scope-row";
    row.innerHTML =
      "<input type=\"text\" class=\"scope-entity-type\" placeholder=\"Entity type (e.g. STATION)\" value=\"" + escapeAttr(entityType || "") + "\" />" +
      "<input type=\"number\" class=\"scope-entity-id\" placeholder=\"Entity ID\" value=\"" + (entityId || "") + "\" />" +
      "<button type=\"button\" class=\"btn-danger btn-sm remove-scope-btn\">Remove</button>";

    row.querySelector(".remove-scope-btn").addEventListener("click", function () {
      row.remove();
    });

    scopesList.appendChild(row);
  }

  document.getElementById("add-scope-btn").addEventListener("click", function () {
    addScopeRow("", "");
  });

  document.getElementById("cancel-edit-btn").addEventListener("click", function () {
    document.getElementById("user-edit-modal").style.display = "none";
  });

  document.getElementById("edit-user-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var userId = document.getElementById("edit-user-id").value;
    var newRole = document.getElementById("edit-user-role").value;

    try {
      // Update role
      await api("PATCH", "/api/v1/admin/users/" + userId + "/role", { role: newRole });

      // Collect scopes
      var scopeRows = document.querySelectorAll("#scopes-list .scope-row");
      var scopes = [];
      scopeRows.forEach(function (row) {
        var entityType = row.querySelector(".scope-entity-type").value.trim();
        var entityId = parseInt(row.querySelector(".scope-entity-id").value, 10);
        if (entityType && !isNaN(entityId)) {
          scopes.push({ entityType: entityType, entityId: entityId });
        }
      });

      // Update scopes
      await api("PUT", "/api/v1/admin/users/" + userId + "/scopes", { scopes: scopes });

      document.getElementById("user-edit-modal").style.display = "none";
      loadUsers();
    } catch (err) {
      alert("Failed to save changes: " + err.message);
    }
  });

  // ─── Invitations ───────────────────────────────────────────────────
  async function loadInvitations() {
    try {
      var invitations = await api("GET", "/api/v1/admin/invitations");
      renderInvitations(invitations);
    } catch (err) {
      console.error("Failed to load invitations:", err);
    }
  }

  function renderInvitations(invitations) {
    var tbody = document.getElementById("invitations-tbody");
    tbody.innerHTML = "";

    invitations.forEach(function (inv) {
      var tr = document.createElement("tr");

      var statusClass = "badge-" + (inv.status || "PENDING").toLowerCase();
      var expiresText = inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "N/A";

      tr.innerHTML =
        "<td class=\"code-cell\">" + escapeHtml(inv.code) + "</td>" +
        "<td>" + escapeHtml(inv.role) + "</td>" +
        "<td>" + (inv.scopeId != null ? inv.scopeId : "N/A") + "</td>" +
        "<td>" + (inv.maxUses != null ? inv.maxUses : "Unlimited") + "</td>" +
        "<td>" + (inv.usedCount || 0) + "</td>" +
        "<td><span class=\"badge " + statusClass + "\">" + escapeHtml(inv.status || "PENDING") + "</span></td>" +
        "<td>" + expiresText + "</td>" +
        "<td class=\"actions-cell\"></td>";

      var actionsCell = tr.querySelector(".actions-cell");

      if (inv.status === "PENDING") {
        var revokeBtn = document.createElement("button");
        revokeBtn.textContent = "Revoke";
        revokeBtn.className = "btn-danger btn-sm";
        revokeBtn.addEventListener("click", function () { revokeInvitation(inv.id); });
        actionsCell.appendChild(revokeBtn);
      }

      tbody.appendChild(tr);
    });
  }

  async function revokeInvitation(invId) {
    try {
      await api("PATCH", "/api/v1/admin/invitations/" + invId + "/revoke");
      loadInvitations();
    } catch (err) {
      alert("Failed to revoke invitation: " + err.message);
    }
  }

  // ─── Create Invitation ─────────────────────────────────────────────
  document.getElementById("create-invitation-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var resultEl = document.getElementById("invitation-result");
    resultEl.style.display = "none";

    var role = document.getElementById("inv-role").value;
    var scopeIdVal = document.getElementById("inv-scope-id").value;
    var maxUses = parseInt(document.getElementById("inv-max-uses").value, 10);

    var body = { role: role, maxUses: maxUses };
    if (scopeIdVal) {
      body.scopeId = parseInt(scopeIdVal, 10);
    }

    try {
      var inv = await api("POST", "/api/v1/admin/invitations", body);
      resultEl.textContent = "Invitation created! Code: " + inv.code;
      resultEl.style.display = "";
      document.getElementById("create-invitation-form").reset();
      document.getElementById("inv-max-uses").value = "1";
      loadInvitations();
    } catch (err) {
      alert("Failed to create invitation: " + err.message);
    }
  });

  // ─── Utilities ──────────────────────────────────────────────────────
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ─── Init ───────────────────────────────────────────────────────────
  if (accessToken && currentUser && currentUser.role === "ADMIN") {
    showDashboard();
  } else {
    clearAuth();
    showLogin();
  }
})();
