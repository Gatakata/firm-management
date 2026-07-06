const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
const mustResetNotice = document.querySelector('meta[name="must-reset"]')?.content === "true";

const state = {
  currentUser: null,
  module: "dashboard",
  revenueChart: null,
  analyticsTrendChart: null,
  analyticsAgingChart: null,
  analyticsFilter: { period: "quarter", start_date: "", end_date: "" },
  assignableUsers: null,
  assignableClients: null,
};

const moduleDefs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "analytics", label: "Analytics & Reports" },
  { id: "prospects", label: "Prospect Hub" },
  { id: "quotations", label: "Quotation Manager" },
  { id: "clients", label: "Client Register" },
  { id: "projects", label: "Project Tracker" },
  { id: "invoices", label: "Invoice & Payments" },
  { id: "compliance", label: "Compliance Centre" },
  { id: "users", label: "Users" },
  { id: "account", label: "Account" },
];

function fmtMoney(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value || 0);
}

function fmtQuotationMoney(value, currencyLabel) {
  const codeMap = {
    USD: "USD",
    SCR: "SCR",
    "Seychelles Rupees": "SCR",
    Euro: "EUR",
  };
  const currencyCode = codeMap[currencyLabel] || "USD";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currencyCode }).format(value || 0);
}

function fmtAmount(value) {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

function toast(message, type = "success") {
  const stack = document.getElementById("toast-stack");
  stack.className = "toast-stack";
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 4000);
}

async function api(url, options = {}) {
  const opts = {
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
      ...(options.headers || {}),
    },
    credentials: "same-origin",
    ...options,
  };

  const response = await fetch(url, opts);
  const data = await response.json().catch(() => ({ success: false, error: "Invalid server response." }));
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function iconSvg(name) {
  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16"/><rect x="6" y="11" width="3" height="6"/><rect x="11" y="8" width="3" height="9"/><rect x="16" y="5" width="3" height="12"/></svg>',
    prospects: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c1-3 3-5 6-5s5 2 6 5"/><path d="M10 20c1-2 3-3 6-3 2 0 4 1 6 3"/></svg>',
    quotations: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h8M9 17h8"/></svg>',
    clients: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    projects: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20h18"/><path d="M6 16l4-4 3 2 5-6"/></svg>',
    invoices: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1.4 1.4-2.5 3-2.5s3 1.1 3 2.5-1.4 2.5-3 2.5-3 1.1-3 2.5S10.4 17 12 17s3-1.1 3-2.5"/></svg>',
    compliance: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    account: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M6 21c1.5-4 4.5-6 6-6s4.5 2 6 6"/></svg>',
  };
  return icons[name] || icons.dashboard;
}

function navHtml(item, active) {
  return `<a href="#" class="nav-item ${active ? "active" : ""}" data-module="${item.id}"><span>${iconSvg(item.id)}</span><span>${item.label}</span></a>`;
}

function setSidebarOpen(isOpen) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.classList.toggle("open", Boolean(isOpen));
  document.body.classList.toggle("nav-open", Boolean(isOpen));
}

function closeSidebar() {
  setSidebarOpen(false);
}

function buildNav() {
  const nav = document.getElementById("nav-list");
  const filtered = moduleDefs.filter((m) => m.id !== "users" || state.currentUser?.role === "Administrator");
  nav.innerHTML = filtered.map((m) => navHtml(m, m.id === state.module)).join("");
  nav.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      state.module = item.dataset.module;
      buildNav();
      renderModule();
      closeSidebar();
    });
  });
}

function setHeader(title, subtitle = "") {
  document.getElementById("module-header").innerHTML = `<h2>${title}</h2><p class="module-subtitle">${subtitle}</p>`;
}

function badgeClass(value) {
  const v = (value || "").toLowerCase();
  if (["accepted", "converted", "signed", "completed", "paid", "acknowledged"].includes(v)) return "badge-green";
  if (["pending", "issued", "submitted", "partially paid"].includes(v)) return "badge-amber";
  if (["rejected", "overdue", "outstanding"].includes(v)) return "badge-red";
  if (["new", "in progress", "unpaid"].includes(v)) return "badge-navy";
  if (["proposal sent", "contacted", "under review"].includes(v)) return "badge-orange";
  return "badge-grey";
}

function openModal(html) {
  const overlay = document.getElementById("modal-overlay");
  const card = document.getElementById("modal-card");
  card.innerHTML = html;
  overlay.hidden = false;
}

function closeModal() {
  document.getElementById("modal-overlay").hidden = true;
}

function twoStepDelete(label, onConfirm) {
  openModal(`
    <h3>Delete ${label}</h3>
    <p>This action is destructive and cannot be undone.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cancel-del">Cancel</button>
      <button class="btn btn-danger" id="next-del">Continue</button>
    </div>
  `);
  document.getElementById("cancel-del").onclick = closeModal;
  document.getElementById("next-del").onclick = () => {
    openModal(`
      <h3>Final Confirmation</h3>
      <p>Please confirm deletion of ${label}.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancel-del-2">Cancel</button>
        <button class="btn btn-danger" id="confirm-del">Confirm Delete</button>
      </div>
    `);
    document.getElementById("cancel-del-2").onclick = closeModal;
    document.getElementById("confirm-del").onclick = async () => {
      try {
        await onConfirm();
        closeModal();
      } catch (err) {
        toast(err.message, "error");
      }
    };
  };
}

function openFormModal(title, fields, values, onSubmit) {
  const body = fields
    .map((f) => {
      const value = values?.[f.name] ?? "";
      if (f.type === "textarea") {
        return `<label class="label">${f.label}</label><textarea class="input" name="${f.name}" ${f.required ? "required" : ""}>${value}</textarea>`;
      }
      if (f.type === "select") {
        const placeholder = f.placeholder ? `<option value="" ${String(value) === "" ? "selected" : ""}>${f.placeholder}</option>` : "";
        const options = (f.options || [])
          .map((opt) => {
            const optionValue = typeof opt === "object" ? opt.value : opt;
            const optionLabel = typeof opt === "object" ? opt.label : opt;
            return `<option value="${optionValue}" ${String(value) === String(optionValue) ? "selected" : ""}>${optionLabel}</option>`;
          })
          .join("");
        return `<label class="label">${f.label}</label><select class="input" name="${f.name}" ${f.required ? "required" : ""}>${placeholder}${options}</select>`;
      }
      return `<label class="label">${f.label}</label><input class="input" name="${f.name}" type="${f.type || "text"}" value="${value}" ${f.required ? "required" : ""}>`;
    })
    .join("");

  openModal(`
    <h3>${title}</h3>
    <form id="entity-form">
      <div class="modal-form-body">${body}</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="cancel-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `);

  document.getElementById("cancel-modal").onclick = closeModal;
  document.getElementById("entity-form").onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    try {
      await onSubmit(payload);
      closeModal();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

async function getAssignableUserOptions() {
  if (!state.assignableUsers) {
    const res = await api("/api/users/assignable");
    state.assignableUsers = res.data || [];
  }

  return state.assignableUsers.map((user) => ({
    value: String(user.id),
    label: user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username,
  }));
}

async function getAssignableClientOptions() {
  if (!state.assignableClients) {
    const res = await api("/api/clients");
    state.assignableClients = res.data || [];
  }

  return state.assignableClients.map((client) => ({
    value: String(client.id),
    label: client.company_name,
  }));
}

async function getProjectOptions(clientId = null) {
  const query = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  const res = await api(`/api/projects${query}`);
  const projects = res.data || [];
  return projects.map((project) => ({
    value: String(project.id),
    label: project.service_type || `Project #${project.id}`,
  }));
}

async function renderDashboard() {
  setHeader("Dashboard", "Firm-wide KPIs, revenue trends, and operational risk alerts.");
  const content = document.getElementById("module-content");
  const { data } = await api("/api/dashboard");
  const k = data.kpis;
  const revenue = k.revenue_collected_by_currency || { USD: 0, SCR: 0, Euro: 0 };
  const agedByCurrency = data.aged_debtors_by_currency || {
    USD: { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0, total: 0 },
    SCR: { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0, total: 0 },
    Euro: { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0, total: 0 },
  };
  const cards = [
    ["Total Prospective Clients", k.total_prospects],
    ["Quotations Sent", k.quotations_sent],
    ["Quotations Accepted", k.quotations_accepted],
    ["Confirmed Clients", k.confirmed_clients],
    ["Projects In Progress", k.projects_in_progress],
    ["Invoices Outstanding", k.invoices_outstanding],
    ["Revenue Collected USD", fmtQuotationMoney(revenue.USD || 0, "USD")],
    ["Revenue Collected SCR", fmtQuotationMoney(revenue.SCR || 0, "SCR")],
    ["Revenue Collected Euro", fmtQuotationMoney(revenue.Euro || 0, "Euro")],
    ["Tax Returns Submitted", k.tax_returns_submitted],
    ["Client Conversion Rate", `${k.client_conversion_rate}%`],
  ];

  content.innerHTML = `
    <div class="kpi-grid">${cards
      .map(
        ([label, value]) => `<div class="card kpi-card"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`
      )
      .join("")}</div>
    <div class="dashboard-grid dashboard-grid-two">
      <div class="card dashboard-panel"><h3>Overdue Projects</h3><div class="dashboard-scroll-list">${(data.overdue_projects || [])
        .map(
          (p) => `<div class="list-item"><strong>${p.project_name}</strong><div class="meta">${p.client}</div><span class="badge badge-red">${p.days_overdue} days overdue</span></div>`
        )
        .join("") || "<p>No overdue projects.</p>"}</div></div>
      <div class="card dashboard-panel"><h3>Upcoming Compliance</h3><div class="dashboard-scroll-list">${(data.upcoming_compliance || [])
        .map(
          (c) => `<div class="list-item"><strong>${c.client}</strong><div class="meta">${c.tax_type}</div><span class="badge ${c.urgent ? "badge-red" : "badge-amber"}">${c.days_remaining} days</span></div>`
        )
        .join("") || "<p>No upcoming deadlines.</p>"}</div></div>
    </div>
    <div class="card">
      <h3>Aged Debtors</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Currency</th><th>0-30 days</th><th>31-60 days</th><th>61-90 days</th><th>90+ days</th><th>Total Outstanding</th></tr></thead>
          <tbody>
            ${["USD", "SCR", "Euro"].map((currency) => `<tr>
              <td><span class="badge badge-navy">${currency}</span></td>
              <td>${fmtQuotationMoney(agedByCurrency[currency]?.["0_30"] || 0, currency)}</td>
              <td>${fmtQuotationMoney(agedByCurrency[currency]?.["31_60"] || 0, currency)}</td>
              <td>${fmtQuotationMoney(agedByCurrency[currency]?.["61_90"] || 0, currency)}</td>
              <td>${fmtQuotationMoney(agedByCurrency[currency]?.["90_plus"] || 0, currency)}</td>
              <td>${fmtQuotationMoney(agedByCurrency[currency]?.total || 0, currency)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function monthLabel(isoYearMonth) {
  if (!isoYearMonth || !isoYearMonth.includes("-")) return isoYearMonth || "";
  const [year, month] = isoYearMonth.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function analyticsQueryString(filter) {
  const params = new URLSearchParams();
  params.set("period", filter.period || "quarter");
  if (filter.period === "custom") {
    if (filter.start_date) params.set("start_date", filter.start_date);
    if (filter.end_date) params.set("end_date", filter.end_date);
  }
  return params.toString();
}

async function renderAnalytics() {
  setHeader("Analytics & Reports", "Business insights and export-ready PDF reporting.");
  const content = document.getElementById("module-content");
  const filter = state.analyticsFilter || { period: "quarter", start_date: "", end_date: "" };
  const query = analyticsQueryString(filter);
  const { data } = await api(`/api/analytics?${query}`);
  const k = data.kpis || {};
  const financials = data.financials || {};
  const inv = financials.total_invoiced_by_currency || { USD: 0, SCR: 0, Euro: 0 };
  const col = financials.total_collected_by_currency || { USD: 0, SCR: 0, Euro: 0 };
  const out = financials.outstanding_by_currency || { USD: 0, SCR: 0, Euro: 0 };
  const debt = data.aged_debtors || { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0, total: 0 };
  const topClients = data.top_clients_by_outstanding || [];
  const periodMeta = data.period || { label: "Last 3 Months", preset: "quarter", start_date: "", end_date: "" };
  const isCustom = (filter.period || "") === "custom";

  content.innerHTML = `
    <div class="module-top card analytics-actions">
      <div class="analytics-export-copy">
        <h3>Executive Report</h3>
        <p>${periodMeta.label || "Selected period"}. Download a polished PDF summary for management meetings.</p>
      </div>
      <div class="analytics-filter-controls">
        <label class="label analytics-inline-label">Period</label>
        <select class="input" id="analytics-period">
          <option value="month" ${(filter.period === "month") ? "selected" : ""}>This Month</option>
          <option value="quarter" ${(filter.period === "quarter") ? "selected" : ""}>Last 3 Months</option>
          <option value="year" ${(filter.period === "year") ? "selected" : ""}>Year to Date</option>
          <option value="all" ${(filter.period === "all") ? "selected" : ""}>All Time</option>
          <option value="custom" ${isCustom ? "selected" : ""}>Custom</option>
        </select>
      </div>
      <div class="analytics-custom-range ${isCustom ? "" : "hidden"}" id="analytics-custom-range">
        <div>
          <label class="label analytics-inline-label">Start Date</label>
          <input class="input" type="date" id="analytics-start" value="${filter.start_date || ""}">
        </div>
        <div>
          <label class="label analytics-inline-label">End Date</label>
          <input class="input" type="date" id="analytics-end" value="${filter.end_date || ""}">
        </div>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-secondary" id="analytics-apply-filter">Apply Filter</button>
      <button class="btn btn-primary" id="download-analytics-pdf">Export PDF Report</button>
    </div>

    <div class="analytics-kpi-grid">
      <div class="card analytics-kpi-card"><span class="analytics-kpi-label">Total Prospects</span><strong class="analytics-kpi-value">${k.total_prospects || 0}</strong></div>
      <div class="card analytics-kpi-card"><span class="analytics-kpi-label">Total Clients</span><strong class="analytics-kpi-value">${k.total_clients || 0}</strong></div>
      <div class="card analytics-kpi-card"><span class="analytics-kpi-label">Active Projects</span><strong class="analytics-kpi-value">${k.active_projects || 0}</strong></div>
      <div class="card analytics-kpi-card"><span class="analytics-kpi-label">Overdue Projects</span><strong class="analytics-kpi-value">${k.overdue_projects || 0}</strong></div>
      <div class="card analytics-kpi-card"><span class="analytics-kpi-label">Unpaid Invoices</span><strong class="analytics-kpi-value">${k.unpaid_invoices || 0}</strong></div>
      <div class="card analytics-kpi-card"><span class="analytics-kpi-label">Overdue Invoices</span><strong class="analytics-kpi-value">${k.overdue_invoices || 0}</strong></div>
      <div class="card analytics-kpi-card"><span class="analytics-kpi-label">Compliance Due (14 Days)</span><strong class="analytics-kpi-value">${k.compliance_due_14_days || 0}</strong></div>
      <div class="card analytics-kpi-card"><span class="analytics-kpi-label">Compliance Overdue</span><strong class="analytics-kpi-value">${k.compliance_overdue || 0}</strong></div>
    </div>

    <div class="analytics-grid">
      <div class="card analytics-panel">
        <h3>Invoiced vs Collected Trend</h3>
        <canvas id="analytics-trend-chart" height="170"></canvas>
      </div>
      <div class="card analytics-panel">
        <h3>Aged Debtors Mix</h3>
        <canvas id="analytics-aging-chart" height="170"></canvas>
      </div>
      <div class="card analytics-panel">
        <h3>Currency Performance</h3>
        <div class="analytics-currency-grid">
          <div class="summary-chip">Invoiced USD<br><strong>${fmtQuotationMoney(inv.USD || 0, "USD")}</strong></div>
          <div class="summary-chip">Invoiced SCR<br><strong>${fmtQuotationMoney(inv.SCR || 0, "SCR")}</strong></div>
          <div class="summary-chip">Invoiced Euro<br><strong>${fmtQuotationMoney(inv.Euro || 0, "Euro")}</strong></div>
          <div class="summary-chip">Collected USD<br><strong>${fmtQuotationMoney(col.USD || 0, "USD")}</strong></div>
          <div class="summary-chip">Collected SCR<br><strong>${fmtQuotationMoney(col.SCR || 0, "SCR")}</strong></div>
          <div class="summary-chip">Collected Euro<br><strong>${fmtQuotationMoney(col.Euro || 0, "Euro")}</strong></div>
          <div class="summary-chip">Outstanding USD<br><strong>${fmtQuotationMoney(out.USD || 0, "USD")}</strong></div>
          <div class="summary-chip">Outstanding SCR<br><strong>${fmtQuotationMoney(out.SCR || 0, "SCR")}</strong></div>
          <div class="summary-chip">Outstanding Euro<br><strong>${fmtQuotationMoney(out.Euro || 0, "Euro")}</strong></div>
        </div>
      </div>
      <div class="card analytics-panel analytics-wide">
        <h3>Top Clients by Outstanding Balance</h3>
        <div class="table-wrap">
          <table class="table-analytics">
            <thead><tr><th>Client</th><th>Outstanding (Mixed)</th></tr></thead>
            <tbody>
              ${(topClients.length ? topClients.map((row) => `<tr><td>${row.client}</td><td>${fmtAmount(row.outstanding)}</td></tr>`).join("") : '<tr><td colspan="2">No outstanding balances.</td></tr>')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const periodSelect = document.getElementById("analytics-period");
  const customRange = document.getElementById("analytics-custom-range");

  periodSelect.onchange = () => {
    state.analyticsFilter.period = periodSelect.value;
    if (periodSelect.value === "custom") {
      customRange.classList.remove("hidden");
      return;
    }
    state.analyticsFilter.start_date = "";
    state.analyticsFilter.end_date = "";
    renderAnalytics();
  };

  document.getElementById("analytics-apply-filter").onclick = () => {
    const period = document.getElementById("analytics-period").value;
    const nextFilter = { period, start_date: "", end_date: "" };
    if (period === "custom") {
      nextFilter.start_date = document.getElementById("analytics-start").value;
      nextFilter.end_date = document.getElementById("analytics-end").value;
      if (!nextFilter.start_date || !nextFilter.end_date) {
        toast("Select both start and end dates for custom range.", "warning");
        return;
      }
    }
    state.analyticsFilter = nextFilter;
    renderAnalytics();
  };

  document.getElementById("download-analytics-pdf").onclick = () => {
    const pdfQuery = analyticsQueryString(state.analyticsFilter || { period: "quarter" });
    window.location.href = `/api/analytics/report.pdf?${pdfQuery}`;
  };

  const trendCtx = document.getElementById("analytics-trend-chart");
  if (state.analyticsTrendChart) state.analyticsTrendChart.destroy();
  state.analyticsTrendChart = new Chart(trendCtx, {
    type: "bar",
    data: {
      labels: (data.monthly_financials || []).map((m) => monthLabel(m.month)),
      datasets: [
        {
          label: "Invoiced",
          data: (data.monthly_financials || []).map((m) => m.invoiced),
          backgroundColor: "rgba(28, 63, 107, 0.85)",
          borderRadius: 8,
        },
        {
          label: "Collected",
          data: (data.monthly_financials || []).map((m) => m.collected),
          backgroundColor: "rgba(229, 138, 43, 0.85)",
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      scales: { y: { beginAtZero: true } },
    },
  });

  const agingCtx = document.getElementById("analytics-aging-chart");
  if (state.analyticsAgingChart) state.analyticsAgingChart.destroy();
  state.analyticsAgingChart = new Chart(agingCtx, {
    type: "doughnut",
    data: {
      labels: ["0-30", "31-60", "61-90", "90+"],
      datasets: [
        {
          data: [debt["0_30"], debt["31_60"], debt["61_90"], debt["90_plus"]],
          backgroundColor: ["#1c3f6b", "#2a5d95", "#f0ad4e", "#cb6812"],
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        title: {
          display: true,
          text: `Total: ${fmtAmount(debt.total || 0)}`,
        },
      },
    },
  });
}

function tableShell(topbar, headers, rows, extra = "", tableClass = "") {
  const cls = tableClass ? ` class="${tableClass}"` : "";
  return `${topbar}${extra}<div class="card table-wrap"><table${cls}><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || '<tr><td colspan="20">No records found.</td></tr>'}</tbody></table></div>`;
}

function prospectsRows(data) {
  const rows = data.map((r) => `
    <tr>
      <td>${r.id}</td><td>${r.company_name || ""}</td><td>${r.contact_person || ""}</td><td>${r.phone || ""}</td><td>${r.email || ""}</td>
      <td>${r.service_required || ""}</td><td>${r.lead_source || ""}</td>
      <td><span class="badge ${badgeClass(r.marketing_status)}">${r.marketing_status || ""}</span></td>
      <td><span class="badge ${badgeClass(r.quotation_status)}">${r.quotation_status || ""}</span></td>
      <td>${r.assigned_to_name || ""}</td><td>${(r.created_at || "").slice(0,10)}</td>
      <td>
        <button class="btn btn-secondary btn-sm" data-edit="${r.id}">Edit</button>
        <button class="btn btn-secondary btn-sm" data-sendq="${r.id}">Send Quotation</button>
        <button class="btn btn-danger btn-sm" data-del="${r.id}">Delete</button>
      </td>
    </tr>
  `);
  return rows.join("") || '<tr><td colspan="12">No records found.</td></tr>';
}

function bindProspectActions(data) {
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openProspectForm(data.find((x) => x.id == b.dataset.edit)));
  document.querySelectorAll("[data-sendq]").forEach((b) => b.onclick = () => openQuotationForm({ prospect_id: b.dataset.sendq }));
  document.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    twoStepDelete("Prospect", async () => {
      await api(`/api/prospects/${b.dataset.del}`, { method: "DELETE" });
      toast("Prospect deleted.", "success");
      renderProspects();
    });
  });
}

async function renderProspects() {
  setHeader("Prospect Hub", "Manage leads, marketing progression, and quotation readiness.");
  const { data } = await api("/api/prospects");
  const headers = ["ID", "Company", "Contact", "Phone", "Email", "Service", "Lead Source", "Marketing", "Quotation", "Assigned", "Created", "Actions"];
  const rows = data.map((r) => `
    <tr>
      <td>${r.id}</td><td>${r.company_name || ""}</td><td>${r.contact_person || ""}</td><td>${r.phone || ""}</td><td>${r.email || ""}</td>
      <td>${r.service_required || ""}</td><td>${r.lead_source || ""}</td>
      <td><span class="badge ${badgeClass(r.marketing_status)}">${r.marketing_status || ""}</span></td>
      <td><span class="badge ${badgeClass(r.quotation_status)}">${r.quotation_status || ""}</span></td>
      <td>${r.assigned_to_name || ""}</td><td>${(r.created_at || "").slice(0,10)}</td>
      <td>
        <button class="btn btn-secondary btn-sm" data-edit="${r.id}">Edit</button>
        <button class="btn btn-secondary btn-sm" data-sendq="${r.id}">Send Quotation</button>
        <button class="btn btn-danger btn-sm" data-del="${r.id}">Delete</button>
      </td>
    </tr>
  `);

  document.getElementById("module-content").innerHTML = tableShell(
    `<div class="module-top card"><input class="input" placeholder="Search prospects" id="search-prospects"><div class="spacer"></div><button class="btn btn-primary" id="add-prospect">Add Prospect</button></div>`,
    headers,
    rows
  );

  document.getElementById("add-prospect").onclick = () => openProspectForm();
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openProspectForm(data.find((x) => x.id == b.dataset.edit)));
  document.querySelectorAll("[data-sendq]").forEach((b) => b.onclick = () => openQuotationForm({ prospect_id: b.dataset.sendq }));
  document.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    twoStepDelete("Prospect", async () => {
      await api(`/api/prospects/${b.dataset.del}`, { method: "DELETE" });
      toast("Prospect deleted.", "success");
      renderProspects();
    });
  });

  document.getElementById("search-prospects").oninput = async (e) => {
    const q = e.target.value;
    const fresh = await api(`/api/prospects?q=${encodeURIComponent(q)}`);
    renderProspectsWithData(fresh.data);
  };
}

function renderProspectsWithData(data) {
  const body = document.querySelector("tbody");
  body.innerHTML = prospectsRows(data);
  bindProspectActions(data);
}

async function openProspectForm(item = null) {
  const assignableUserOptions = await getAssignableUserOptions();
  const serviceRequiredOptions = [
    "Bookkeeping and Monthly Management Accounts",
    "Payroll Processing and PAYE Filing",
    "VAT Registration and VAT Returns",
    "Corporate Tax Computation and Filing",
    "Personal Income Tax Returns",
    "Financial Statement Preparation",
    "Audit Support and Liaison",
    "Company Incorporation and Secretarial Services",
    "Compliance Calendar Management",
    "Budgeting, Forecasting, and Cash Flow Advisory",
    "Internal Controls Review",
    "CFO Advisory / Virtual Finance Manager",
    "Other",
  ];
  const leadSourceOptions = [
    "Referral",
    "Website",
    "Social Media",
    "Networking Event",
    "Email Campaign",
    "Walk-in",
    "Cold Call",
    "Other",
  ];
  const existingServiceRequired = item?.service_required || "";
  const usesOtherServiceRequired = existingServiceRequired && !serviceRequiredOptions.includes(existingServiceRequired);
  const existingLeadSource = item?.lead_source || "";
  const usesOtherLeadSource = existingLeadSource && !leadSourceOptions.includes(existingLeadSource);
  const formValues = {
    ...(item || {}),
    service_required: usesOtherServiceRequired ? "Other" : existingServiceRequired,
    service_required_other: usesOtherServiceRequired ? existingServiceRequired : "",
    lead_source: usesOtherLeadSource ? "Other" : existingLeadSource,
    lead_source_other: usesOtherLeadSource ? existingLeadSource : "",
  };

  openFormModal(item ? "Edit Prospect" : "Add Prospect", [
    { name: "company_name", label: "Company Name" },
    { name: "contact_person", label: "Contact Person" },
    { name: "phone", label: "Phone" },
    { name: "email", label: "Email", type: "email" },
    { name: "service_required", label: "Service Required", type: "select", options: serviceRequiredOptions, required: true, placeholder: "Select service required" },
    { name: "service_required_other", label: "Specify Other Service Required" },
    { name: "lead_source", label: "Lead Source", type: "select", options: leadSourceOptions, required: true, placeholder: "Select lead source" },
    { name: "lead_source_other", label: "Specify Other Lead Source" },
    { name: "marketing_status", label: "Marketing Status", type: "select", options: ["New", "Contacted", "Proposal Sent", "Converted", "Lost"] },
    { name: "quotation_status", label: "Quotation Status", type: "select", options: ["None", "Pending", "Accepted", "Rejected"] },
    { name: "assigned_to", label: "Assigned To", type: "select", options: assignableUserOptions, placeholder: "Select team member" },
    { name: "notes", label: "Notes", type: "textarea" },
  ], formValues, async (payload) => {
    if (payload.service_required === "Other") {
      const otherServiceRequired = (payload.service_required_other || "").trim();
      if (!otherServiceRequired) {
        throw new Error("Please specify the other service required.");
      }
      payload.service_required = otherServiceRequired;
    }
    delete payload.service_required_other;

    if (payload.lead_source === "Other") {
      const otherLeadSource = (payload.lead_source_other || "").trim();
      if (!otherLeadSource) {
        throw new Error("Please specify the other lead source.");
      }
      payload.lead_source = otherLeadSource;
    }
    delete payload.lead_source_other;

    const method = item ? "PUT" : "POST";
    const url = item ? `/api/prospects/${item.id}` : "/api/prospects";
    await api(url, { method, body: JSON.stringify(payload) });
    toast(`Prospect ${item ? "updated" : "created"}.`, "success");
    renderProspects();
  });

  const serviceRequiredSelect = document.querySelector('select[name="service_required"]');
  const otherServiceRequiredInput = document.querySelector('input[name="service_required_other"]');
  const otherServiceRequiredLabel = otherServiceRequiredInput?.previousElementSibling;
  const leadSourceSelect = document.querySelector('select[name="lead_source"]');
  const otherLeadSourceInput = document.querySelector('input[name="lead_source_other"]');
  const otherLeadSourceLabel = otherLeadSourceInput?.previousElementSibling;

  const syncOtherServiceRequiredField = () => {
    const showOther = serviceRequiredSelect?.value === "Other";
    if (otherServiceRequiredLabel) {
      otherServiceRequiredLabel.style.display = showOther ? "block" : "none";
    }
    if (otherServiceRequiredInput) {
      otherServiceRequiredInput.style.display = showOther ? "block" : "none";
      otherServiceRequiredInput.required = !!showOther;
      if (!showOther) {
        otherServiceRequiredInput.value = "";
      }
    }
  };

  const syncOtherLeadSourceField = () => {
    const showOther = leadSourceSelect?.value === "Other";
    if (otherLeadSourceLabel) {
      otherLeadSourceLabel.style.display = showOther ? "block" : "none";
    }
    if (otherLeadSourceInput) {
      otherLeadSourceInput.style.display = showOther ? "block" : "none";
      otherLeadSourceInput.required = !!showOther;
      if (!showOther) {
        otherLeadSourceInput.value = "";
      }
    }
  };

  serviceRequiredSelect?.addEventListener("change", syncOtherServiceRequiredField);
  leadSourceSelect?.addEventListener("change", syncOtherLeadSourceField);
  syncOtherServiceRequiredField();
  syncOtherLeadSourceField();
}

function renderQuotationRow(q) {
  const serviceText = q.service_description || "";
  return `
    <tr>
      <td class="col-ref">${q.quotation_ref}</td>
      <td class="col-prospect">${q.prospect_company || ""}</td>
      <td class="col-service"><span class="service-snippet" title="${serviceText.replace(/"/g, "&quot;")}">${serviceText}</span></td>
      <td class="col-amount">${fmtQuotationMoney(q.amount, q.currency)}</td>
      <td class="col-currency"><span class="badge badge-navy">${q.currency || ""}</span></td>
      <td class="col-date">${q.sent_date || ""}</td>
      <td class="col-status"><span class="badge ${badgeClass(q.status)}">${q.status}</span></td>
      <td class="col-created">${q.created_by_name || ""}</td>
      <td class="col-actions">
        <button class="btn btn-secondary btn-sm" data-edit-q="${q.id}">Edit</button>
        <button class="btn btn-secondary btn-sm" data-acc-q="${q.id}">Mark Accepted</button>
        <button class="btn btn-secondary btn-sm" data-rej-q="${q.id}">Mark Rejected</button>
        <button class="btn btn-danger btn-sm" data-del-q="${q.id}">Delete</button>
      </td>
    </tr>
  `;
}

function quotationRows(data) {
  const rows = data.map((q) => renderQuotationRow(q));
  return rows.join("") || '<tr><td colspan="9">No records found.</td></tr>';
}

function bindQuotationActions(data) {
  document.querySelectorAll("[data-edit-q]").forEach((b) => b.onclick = () => openQuotationForm(data.find((x) => x.id == b.dataset.editQ)));
  document.querySelectorAll("[data-acc-q]").forEach((b) => b.onclick = async () => {
    const res = await api(`/api/quotations/${b.dataset.accQ}`, { method: "PUT", body: JSON.stringify({ status: "Accepted" }) });
    toast(res.message || "Quotation accepted.", "success");
    renderQuotations();
  });
  document.querySelectorAll("[data-rej-q]").forEach((b) => b.onclick = async () => {
    await api(`/api/quotations/${b.dataset.rejQ}`, { method: "PUT", body: JSON.stringify({ status: "Rejected" }) });
    toast("Quotation rejected.", "warning");
    renderQuotations();
  });
  document.querySelectorAll("[data-del-q]").forEach((b) => b.onclick = () => {
    twoStepDelete("Quotation", async () => {
      await api(`/api/quotations/${b.dataset.delQ}`, { method: "DELETE" });
      toast("Quotation deleted.", "success");
      renderQuotations();
    });
  });
}

async function renderQuotations() {
  setHeader("Quotation Manager", "Issue, track, and convert quotations to confirmed clients.");
  const { data, summary } = await api("/api/quotations");
  const rows = data.map((q) => renderQuotationRow(q));
  const totals = summary.totals_by_currency || { USD: 0, SCR: 0, Euro: 0 };

  document.getElementById("module-content").innerHTML = tableShell(
    `<div class="module-top card"><input class="input" id="q-search" placeholder="Search quotations"><div class="spacer"></div><button class="btn btn-primary" id="add-quotation">Create Quotation</button></div>`,
    ["Quotation Ref", "Prospect", "Service", "Amount", "Currency", "Sent Date", "Status", "Created By", "Actions"],
    rows,
    `<div class="card summary-bar summary-bar-quotations">
      <div class="summary-chip">Total Quotations<br><strong>${summary.total_quotations}</strong></div>
      <div class="summary-chip">USD Total<br><strong>${fmtQuotationMoney(totals.USD || 0, "USD")}</strong></div>
      <div class="summary-chip">SCR Total<br><strong>${fmtQuotationMoney(totals.SCR || 0, "SCR")}</strong></div>
      <div class="summary-chip">Euro Total<br><strong>${fmtQuotationMoney(totals.Euro || 0, "Euro")}</strong></div>
      <div class="summary-chip">Accepted<br><strong>${summary.accepted}</strong></div>
      <div class="summary-chip">Rejected<br><strong>${summary.rejected}</strong></div>
      <div class="summary-chip">Conversion<br><strong>${summary.conversion_rate}%</strong></div>
    </div>`,
    "table-quotations"
  );

  document.getElementById("add-quotation").onclick = () => openQuotationForm();
  bindQuotationActions(data);

  document.getElementById("q-search").oninput = async (e) => {
    const q = e.target.value;
    const fresh = await api(`/api/quotations?q=${encodeURIComponent(q)}`);
    document.querySelector("tbody").innerHTML = quotationRows(fresh.data);
    bindQuotationActions(fresh.data);
  };
}

function openQuotationForm(item = null) {
  const quotationFields = [
    { name: "prospect_id", label: "Prospect ID", type: "number", required: true },
    ...(item ? [{ name: "quotation_ref", label: "Quotation Reference" }] : []),
    { name: "service_description", label: "Service Description", type: "textarea" },
    { name: "amount", label: "Amount", type: "number" },
    {
      name: "currency",
      label: "Currency",
      type: "select",
      options: ["USD", "SCR", "Euro"],
      required: true,
      placeholder: "Select currency"
    },
    { name: "sent_date", label: "Sent Date", type: "date" },
    { name: "status", label: "Status", type: "select", options: ["Pending", "Accepted", "Rejected"] },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  openFormModal(item ? "Edit Quotation" : "Create Quotation", quotationFields, item, async (payload) => {
    const method = item ? "PUT" : "POST";
    const url = item ? `/api/quotations/${item.id}` : "/api/quotations";
    const res = await api(url, { method, body: JSON.stringify(payload) });
    toast(res.message || `Quotation ${item ? "updated" : "created"}.`, "success");
    renderQuotations();
  });
}

function clientRows(data) {
  const rows = data.map((c) => `<tr>
      <td>${c.id}</td><td>${c.company_name}${c.engagement_warning ? " [!]" : ""}</td><td>${c.contact_person || ""}</td><td>${c.email || ""}</td><td>${c.service_type || ""}</td>
      <td><span class="badge ${badgeClass(c.engagement_letter_status)}">${c.engagement_letter_status}</span></td><td>${c.onboarding_complete ? "Yes" : "No"}</td><td>${c.assigned_to_name || ""}</td>
      <td><button class="btn btn-secondary btn-sm" data-view-c="${c.id}">View</button><button class="btn btn-secondary btn-sm" data-edit-c="${c.id}">Edit</button><button class="btn btn-danger btn-sm" data-del-c="${c.id}">Delete</button></td>
    </tr>`);
  return rows.join("") || '<tr><td colspan="9">No records found.</td></tr>';
}

function bindClientActions(data) {
  document.querySelectorAll("[data-view-c]").forEach((b) => b.onclick = () => viewClientDetails(b.dataset.viewC));
  document.querySelectorAll("[data-edit-c]").forEach((b) => b.onclick = () => openClientForm(data.find((x) => x.id == b.dataset.editC)));
  document.querySelectorAll("[data-del-c]").forEach((b) => b.onclick = () => {
    twoStepDelete("Client", async () => {
      await api(`/api/clients/${b.dataset.delC}`, { method: "DELETE" });
      toast("Client deleted.", "success");
      renderClients();
    });
  });
}

async function renderClients() {
  setHeader("Client Register", "Central register of confirmed and onboarding clients.");
  const { data } = await api("/api/clients");
  document.getElementById("module-content").innerHTML = tableShell(
    `<div class="module-top card"><input class="input" id="client-search" placeholder="Search clients"><div class="spacer"></div><button class="btn btn-primary" id="add-client">Add Client</button></div>`,
    ["ID", "Company", "Contact", "Email", "Service", "Engagement", "Onboarding", "Assigned", "Actions"],
    data.map((c) => `<tr>
      <td>${c.id}</td><td>${c.company_name}${c.engagement_warning ? " [!]" : ""}</td><td>${c.contact_person || ""}</td><td>${c.email || ""}</td><td>${c.service_type || ""}</td>
      <td><span class="badge ${badgeClass(c.engagement_letter_status)}">${c.engagement_letter_status}</span></td><td>${c.onboarding_complete ? "Yes" : "No"}</td><td>${c.assigned_to_name || ""}</td>
      <td><button class="btn btn-secondary btn-sm" data-view-c="${c.id}">View</button><button class="btn btn-secondary btn-sm" data-edit-c="${c.id}">Edit</button><button class="btn btn-danger btn-sm" data-del-c="${c.id}">Delete</button></td>
    </tr>`)
  ) + `<div class="card" id="client-detail-panel"><h3>Client Details</h3><p>Select a client to view linked projects, invoices, and compliance records.</p></div>`;

  document.getElementById("add-client").onclick = () => openClientForm();
  bindClientActions(data);

  document.getElementById("client-search").oninput = async (e) => {
    const q = e.target.value;
    const fresh = await api(`/api/clients?q=${encodeURIComponent(q)}`);
    document.querySelector("tbody").innerHTML = clientRows(fresh.data);
    bindClientActions(fresh.data);
  };
}

async function viewClientDetails(id) {
  const { data } = await api(`/api/clients/${id}/full`);
  document.getElementById("client-detail-panel").innerHTML = `
    <h3>${data.company_name}</h3>
    <p>${data.contact_person || ""} | ${data.email || ""} | ${data.phone || ""}</p>
    <h4>Linked Projects</h4>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Service</th><th>Status</th></tr></thead><tbody>${data.projects.map((p) => `<tr><td>${p.id}</td><td>${p.service_type}</td><td><span class="badge ${badgeClass(p.status)}">${p.status}</span></td></tr>`).join("") || "<tr><td colspan='3'>None</td></tr>"}</tbody></table></div>
    <h4 style="margin-top:14px;">Linked Invoices</h4>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Ref</th><th>Status</th></tr></thead><tbody>${data.invoices.map((i) => `<tr><td>${i.id}</td><td>${i.invoice_ref}</td><td><span class="badge ${badgeClass(i.payment_status)}">${i.payment_status}</span></td></tr>`).join("") || "<tr><td colspan='3'>None</td></tr>"}</tbody></table></div>
    <h4 style="margin-top:14px;">Linked Compliance</h4>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Tax Type</th><th>Status</th></tr></thead><tbody>${data.compliance.map((c) => `<tr><td>${c.id}</td><td>${c.tax_type}</td><td><span class="badge ${badgeClass(c.status)}">${c.status}</span></td></tr>`).join("") || "<tr><td colspan='3'>None</td></tr>"}</tbody></table></div>
  `;
}

async function openClientForm(item = null) {
  const assignableUserOptions = await getAssignableUserOptions();
  openFormModal(item ? "Edit Client" : "Add Client", [
    { name: "prospect_id", label: "Prospect ID", type: "number" },
    { name: "quotation_id", label: "Quotation ID", type: "number" },
    { name: "company_name", label: "Company Name" },
    { name: "contact_person", label: "Contact Person" },
    { name: "phone", label: "Phone" },
    { name: "email", label: "Email", type: "email" },
    { name: "service_type", label: "Service Type" },
    { name: "engagement_letter_status", label: "Engagement Letter", type: "select", options: ["Outstanding", "Issued", "Signed"] },
    { name: "engagement_letter_date", label: "Engagement Letter Date", type: "date" },
    { name: "onboarding_complete", label: "Onboarding Complete", type: "select", options: ["", "true", "false"] },
    { name: "assigned_to", label: "Assigned To", type: "select", options: assignableUserOptions, placeholder: "Select team member" },
  ], item, async (payload) => {
    if (payload.onboarding_complete !== "") payload.onboarding_complete = payload.onboarding_complete === "true";
    const method = item ? "PUT" : "POST";
    const url = item ? `/api/clients/${item.id}` : "/api/clients";
    await api(url, { method, body: JSON.stringify(payload) });
    toast(`Client ${item ? "updated" : "created"}.`, "success");
    renderClients();
  });
}

function renderProjectRow(p) {
  const progress = Math.max(0, Math.min(100, p.progress_percentage || 0));
  const progressClass = p.overdue ? "progress-overdue" : progress > 85 ? "progress-warning" : "progress-good";
  return `<tr class="${p.overdue ? "overdue-row" : ""}">
      <td class="col-id">${p.id}</td>
      <td class="col-client">${p.client_name || ""}</td>
      <td class="col-service"><span class="project-service">${p.service_type || ""}</span></td>
      <td class="col-description"><span class="project-description" title="${(p.description || "").replace(/"/g, "&quot;")}">${p.description || ""}</span></td>
      <td class="col-start">${p.start_date || ""}</td>
      <td class="col-expected">${p.expected_completion || ""}</td>
      <td class="col-age">${p.age_days}</td>
      <td class="col-progress">
        <div class="project-progress" title="${progress}%">
          <div class="project-progress-fill ${progressClass}" style="width:${progress}%;"></div>
        </div>
      </td>
      <td class="col-status"><span class="badge ${badgeClass(p.status)}">${p.status}</span>${p.overdue ? '<span class="badge badge-red overdue-flag">OVERDUE</span>' : ""}</td>
      <td class="col-assigned">${p.assigned_to_name || ""}</td>
      <td class="col-actions"><button class="btn btn-secondary btn-sm" data-edit-p="${p.id}">Edit</button><button class="btn btn-secondary btn-sm" data-complete-p="${p.id}">Complete</button><button class="btn btn-danger btn-sm" data-del-p="${p.id}">Delete</button></td>
    </tr>`;
}

function projectRows(data) {
  const rows = data.map((p) => renderProjectRow(p));
  return rows.join("") || '<tr><td colspan="11">No records found.</td></tr>';
}

function bindProjectActions(data) {
  document.querySelectorAll("[data-edit-p]").forEach((b) => b.onclick = () => openProjectForm(data.find((x) => x.id == b.dataset.editP)));
  document.querySelectorAll("[data-complete-p]").forEach((b) => b.onclick = async () => {
    await api(`/api/projects/${b.dataset.completeP}`, { method: "PUT", body: JSON.stringify({ status: "Completed", actual_completion: new Date().toISOString().slice(0, 10) }) });
    toast("Project marked completed.", "success");
    renderProjects();
  });
  document.querySelectorAll("[data-del-p]").forEach((b) => b.onclick = () => {
    twoStepDelete("Project", async () => {
      await api(`/api/projects/${b.dataset.delP}`, { method: "DELETE" });
      toast("Project deleted.", "success");
      renderProjects();
    });
  });
}

async function renderProjects() {
  setHeader("Project Tracker", "Track engagements, SLAs, completion status, and overdue risk.");
  const { data } = await api("/api/projects");
  document.getElementById("module-content").innerHTML = tableShell(
    `<div class="module-top card"><input class="input" placeholder="Search projects" id="project-search"><div class="spacer"></div><button class="btn btn-primary" id="add-project">Add Project</button></div>`,
    ["ID", "Client", "Service", "Description", "Start", "Expected", "Age", "Progress", "Status", "Assigned", "Actions"],
    data.map((p) => renderProjectRow(p)),
    "",
    "table-projects"
  );

  document.getElementById("add-project").onclick = () => openProjectForm();
  bindProjectActions(data);

  document.getElementById("project-search").oninput = async (e) => {
    const q = e.target.value;
    const fresh = await api(`/api/projects?q=${encodeURIComponent(q)}`);
    document.querySelector("tbody").innerHTML = projectRows(fresh.data);
    bindProjectActions(fresh.data);
  };
}

async function openProjectForm(item = null) {
  const assignableUserOptions = await getAssignableUserOptions();
  const assignableClientOptions = await getAssignableClientOptions();
  if (!item && assignableClientOptions.length === 0) {
    toast("Please add a client in Client Register before creating a project.", "warning");
    return;
  }
  const projectServiceTypeOptions = [
    "Bookkeeping and Monthly Management Accounts",
    "Payroll Processing and PAYE Filing",
    "VAT Registration and VAT Returns",
    "Corporate Tax Computation and Filing",
    "Personal Income Tax Returns",
    "Financial Statement Preparation",
    "Audit Support and Liaison",
    "Compliance Calendar Management",
    "Budgeting, Forecasting, and Cash Flow Advisory",
    "Internal Controls Review",
    "CFO Advisory / Virtual Finance Manager",
    "Other",
  ];
  const existingServiceType = item?.service_type || "";
  const usesOtherServiceType = existingServiceType && !projectServiceTypeOptions.includes(existingServiceType);
  const formValues = {
    ...(item || {}),
    service_type: usesOtherServiceType ? "Other" : existingServiceType,
    service_type_other: usesOtherServiceType ? existingServiceType : "",
  };

  openFormModal(item ? "Edit Project" : "Add Project", [
    { name: "client_id", label: "Client", type: "select", options: assignableClientOptions, required: true, placeholder: "Select client" },
    { name: "service_type", label: "Service Type", type: "select", options: projectServiceTypeOptions, required: true, placeholder: "Select service type" },
    { name: "service_type_other", label: "Specify Other Service Type" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "start_date", label: "Start Date", type: "date" },
    { name: "expected_completion", label: "Expected Completion", type: "date" },
    { name: "actual_completion", label: "Actual Completion", type: "date" },
    { name: "status", label: "Status", type: "select", options: ["Not Started", "In Progress", "Under Review", "Completed"] },
    { name: "assigned_to", label: "Assigned To", type: "select", options: assignableUserOptions, placeholder: "Select team member" },
  ], formValues, async (payload) => {
    if (payload.service_type === "Other") {
      const otherServiceType = (payload.service_type_other || "").trim();
      if (!otherServiceType) {
        throw new Error("Please specify the other service type.");
      }
      payload.service_type = otherServiceType;
    }
    delete payload.service_type_other;

    const method = item ? "PUT" : "POST";
    const url = item ? `/api/projects/${item.id}` : "/api/projects";
    await api(url, { method, body: JSON.stringify(payload) });
    toast(`Project ${item ? "updated" : "created"}.`, "success");
    renderProjects();
  });

  const serviceTypeSelect = document.querySelector('select[name="service_type"]');
  const otherServiceTypeInput = document.querySelector('input[name="service_type_other"]');
  const otherServiceTypeLabel = otherServiceTypeInput?.previousElementSibling;
  const statusSelect = document.querySelector('select[name="status"]');
  const actualCompletionInput = document.querySelector('input[name="actual_completion"]');
  const actualCompletionLabel = actualCompletionInput?.previousElementSibling;

  const syncOtherServiceTypeField = () => {
    const showOther = serviceTypeSelect?.value === "Other";
    if (otherServiceTypeLabel) {
      otherServiceTypeLabel.style.display = showOther ? "block" : "none";
    }
    if (otherServiceTypeInput) {
      otherServiceTypeInput.style.display = showOther ? "block" : "none";
      otherServiceTypeInput.required = !!showOther;
      if (!showOther) {
        otherServiceTypeInput.value = "";
      }
    }
  };

  const syncActualCompletionField = () => {
    const showActualCompletion = statusSelect?.value === "Completed";
    if (actualCompletionLabel) {
      actualCompletionLabel.style.display = showActualCompletion ? "block" : "none";
    }
    if (actualCompletionInput) {
      actualCompletionInput.style.display = showActualCompletion ? "block" : "none";
      actualCompletionInput.required = !!showActualCompletion;
      if (!showActualCompletion) {
        actualCompletionInput.value = "";
      }
    }
  };

  serviceTypeSelect?.addEventListener("change", syncOtherServiceTypeField);
  statusSelect?.addEventListener("change", syncActualCompletionField);
  syncOtherServiceTypeField();
  syncActualCompletionField();
}

function renderInvoiceRow(i) {
  const projectText = i.project_name || "";
  return `<tr>
    <td class="col-ref">${i.invoice_ref}</td>
    <td class="col-client">${i.client_name || ""}</td>
    <td class="col-project"><span class="invoice-project" title="${projectText.replace(/"/g, "&quot;")}">${projectText}</span></td>
    <td class="col-amount">${fmtQuotationMoney(i.amount, i.currency)}</td>
    <td class="col-paid">${fmtQuotationMoney(i.amount_paid, i.currency)}</td>
    <td class="col-balance">${fmtQuotationMoney(i.balance_due, i.currency)}</td>
    <td class="col-currency"><span class="badge badge-navy">${i.currency || ""}</span></td>
    <td class="col-date">${i.issue_date || ""}</td>
    <td class="col-date">${i.due_date || ""}</td>
    <td class="col-status"><span class="badge ${badgeClass(i.payment_status)}">${i.payment_status}</span></td>
    <td class="col-actions"><button class="btn btn-secondary btn-sm" data-pay-i="${i.id}">Record Payment</button><button class="btn btn-secondary btn-sm" data-edit-i="${i.id}">Edit</button><button class="btn btn-danger btn-sm" data-del-i="${i.id}">Delete</button></td>
  </tr>`;
}

function invoiceRows(data) {
  const rows = data.map((i) => renderInvoiceRow(i));
  return rows.join("") || '<tr><td colspan="11">No records found.</td></tr>';
}

function bindInvoiceActions(data) {
  document.querySelectorAll("[data-edit-i]").forEach((b) => b.onclick = () => openInvoiceForm(data.find((x) => x.id == b.dataset.editI)));
  document.querySelectorAll("[data-pay-i]").forEach((b) => b.onclick = () => openPaymentForm(b.dataset.payI));
  document.querySelectorAll("[data-del-i]").forEach((b) => b.onclick = () => {
    twoStepDelete("Invoice", async () => {
      await api(`/api/invoices/${b.dataset.delI}`, { method: "DELETE" });
      toast("Invoice deleted.", "success");
      renderInvoices();
    });
  });
}

async function renderInvoices() {
  setHeader("Invoice & Payments", "Control billing lifecycle, payment collection, and debtor aging.");
  const { data, summary, aged_debtors } = await api("/api/invoices");
  const totals = summary.total_invoiced_by_currency || { USD: 0, SCR: 0, Euro: 0 };
  const collected = summary.total_collected_by_currency || { USD: 0, SCR: 0, Euro: 0 };
  const outstanding = summary.outstanding_by_currency || { USD: 0, SCR: 0, Euro: 0 };
  document.getElementById("module-content").innerHTML = tableShell(
    `<div class="module-top card"><input class="input" placeholder="Search invoices" id="invoice-search"><div class="spacer"></div><button class="btn btn-primary" id="add-invoice">Create Invoice</button></div>`,
    ["Ref", "Client", "Project", "Amount", "Paid", "Balance", "Currency", "Issue", "Due", "Status", "Actions"],
    data.map((i) => renderInvoiceRow(i)),
    "",
    "table-invoices"
  ) + `
    <div class="card summary-bar summary-bar-invoices">
      <div class="summary-chip">Invoiced USD<br><strong>${fmtQuotationMoney(totals.USD || 0, "USD")}</strong></div>
      <div class="summary-chip">Invoiced SCR<br><strong>${fmtQuotationMoney(totals.SCR || 0, "SCR")}</strong></div>
      <div class="summary-chip">Invoiced Euro<br><strong>${fmtQuotationMoney(totals.Euro || 0, "Euro")}</strong></div>
      <div class="summary-chip">Collected USD<br><strong>${fmtQuotationMoney(collected.USD || 0, "USD")}</strong></div>
      <div class="summary-chip">Collected SCR<br><strong>${fmtQuotationMoney(collected.SCR || 0, "SCR")}</strong></div>
      <div class="summary-chip">Collected Euro<br><strong>${fmtQuotationMoney(collected.Euro || 0, "Euro")}</strong></div>
      <div class="summary-chip">Outstanding USD<br><strong>${fmtQuotationMoney(outstanding.USD || 0, "USD")}</strong></div>
      <div class="summary-chip">Outstanding SCR<br><strong>${fmtQuotationMoney(outstanding.SCR || 0, "SCR")}</strong></div>
      <div class="summary-chip">Outstanding Euro<br><strong>${fmtQuotationMoney(outstanding.Euro || 0, "Euro")}</strong></div>
      <div class="summary-chip">Overdue Count<br><strong>${summary.overdue_count}</strong></div>
      <div class="summary-chip">Debtors Total (Mixed)<br><strong>${fmtAmount(aged_debtors.total)}</strong></div>
    </div>
    <div class="card">
      <h3>Aged Debtors</h3>
      <div class="summary-bar">
        <div class="summary-chip">0-30 (Mixed): <strong>${fmtAmount(aged_debtors["0_30"])}</strong></div>
        <div class="summary-chip">31-60 (Mixed): <strong>${fmtAmount(aged_debtors["31_60"])}</strong></div>
        <div class="summary-chip">61-90 (Mixed): <strong>${fmtAmount(aged_debtors["61_90"])}</strong></div>
        <div class="summary-chip">90+ (Mixed): <strong>${fmtAmount(aged_debtors["90_plus"])}</strong></div>
      </div>
    </div>`;

  document.getElementById("add-invoice").onclick = () => openInvoiceForm();
  bindInvoiceActions(data);

  document.getElementById("invoice-search").oninput = async (e) => {
    const q = e.target.value;
    const fresh = await api(`/api/invoices?q=${encodeURIComponent(q)}`);
    document.querySelector("tbody").innerHTML = invoiceRows(fresh.data);
    bindInvoiceActions(fresh.data);
  };
}

function openPaymentForm(id) {
  openFormModal("Record Payment", [
    { name: "payment_received", label: "Amount Received", type: "number" },
    { name: "notes", label: "Notes", type: "textarea" },
  ], null, async (payload) => {
    await api(`/api/invoices/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    toast("Payment recorded.", "success");
    renderInvoices();
  });
}

async function openInvoiceForm(item = null) {
  const assignableClientOptions = await getAssignableClientOptions();
  if (!item && assignableClientOptions.length === 0) {
    toast("Please add a client in Client Register before creating an invoice.", "warning");
    return;
  }

  const initialClientId = item?.client_id ? String(item.client_id) : "";
  const initialProjectOptions = initialClientId ? await getProjectOptions(initialClientId) : [];

  const invoiceFields = [
    { name: "client_id", label: "Client", type: "select", options: assignableClientOptions, required: true, placeholder: "Select client" },
    { name: "project_id", label: "Project", type: "select", options: initialProjectOptions, placeholder: "Select project (optional)" },
    ...(item ? [{ name: "invoice_ref", label: "Invoice Reference" }] : []),
    { name: "currency", label: "Currency", type: "select", options: ["USD", "SCR", "Euro"], required: true, placeholder: "Select currency" },
    { name: "amount", label: "Amount", type: "number" },
    { name: "amount_paid", label: "Amount Paid", type: "number" },
    { name: "issue_date", label: "Issue Date", type: "date" },
    { name: "due_date", label: "Due Date", type: "date" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  openFormModal(item ? "Edit Invoice" : "Create Invoice", invoiceFields, item, async (payload) => {
    const method = item ? "PUT" : "POST";
    const url = item ? `/api/invoices/${item.id}` : "/api/invoices";
    await api(url, { method, body: JSON.stringify(payload) });
    toast(`Invoice ${item ? "updated" : "created"}.`, "success");
    renderInvoices();
  });

  const clientSelect = document.querySelector('select[name="client_id"]');
  const projectSelect = document.querySelector('select[name="project_id"]');

  const syncProjectOptions = async () => {
    if (!projectSelect) return;
    const selectedClientId = clientSelect?.value || "";
    if (!selectedClientId) {
      projectSelect.innerHTML = '<option value="">Select project (optional)</option>';
      projectSelect.value = "";
      return;
    }

    const currentValue = projectSelect.value;
    const projectOptions = await getProjectOptions(selectedClientId);
    projectSelect.innerHTML = '<option value="">Select project (optional)</option>'
      + projectOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join("");

    if (projectOptions.some((opt) => String(opt.value) === String(currentValue))) {
      projectSelect.value = String(currentValue);
    } else {
      projectSelect.value = "";
    }
  };

  clientSelect?.addEventListener("change", syncProjectOptions);
}

function complianceRows(data) {
  const rows = data.map((c) => {
    const badge = c.days_remaining == null ? "" : c.days_remaining < 0 ? '<span class="badge badge-red">OVERDUE</span>' : `<span class="badge ${c.days_remaining <= 7 ? "badge-red" : c.days_remaining <= 14 ? "badge-amber" : "badge-green"}">${c.days_remaining}</span>`;
    return `<tr><td>${c.id}</td><td>${c.client_name || ""}</td><td>${c.tax_type}</td><td>${c.tax_period || ""}</td><td>${c.filing_deadline || ""}</td><td>${c.filing_date || ""}</td><td>${badge}</td><td><span class="badge ${badgeClass(c.status)}">${c.status}</span></td><td><button class="btn btn-secondary btn-sm" data-edit-co="${c.id}">Edit</button><button class="btn btn-secondary btn-sm" data-sub-co="${c.id}">Mark Submitted</button><button class="btn btn-secondary btn-sm" data-ack-co="${c.id}">Mark Acknowledged</button><button class="btn btn-danger btn-sm" data-del-co="${c.id}">Delete</button></td></tr>`;
  });
  return rows.join("") || '<tr><td colspan="9">No records found.</td></tr>';
}

function bindComplianceActions(data) {
  document.querySelectorAll("[data-edit-co]").forEach((b) => b.onclick = () => openComplianceForm(data.find((x) => x.id == b.dataset.editCo)));
  document.querySelectorAll("[data-sub-co]").forEach((b) => b.onclick = async () => { await api(`/api/compliance/${b.dataset.subCo}`, { method: "PUT", body: JSON.stringify({ status: "Submitted" }) }); toast("Marked submitted.", "success"); renderCompliance(); });
  document.querySelectorAll("[data-ack-co]").forEach((b) => b.onclick = async () => { await api(`/api/compliance/${b.dataset.ackCo}`, { method: "PUT", body: JSON.stringify({ status: "Acknowledged" }) }); toast("Marked acknowledged.", "success"); renderCompliance(); });
  document.querySelectorAll("[data-del-co]").forEach((b) => b.onclick = () => twoStepDelete("Compliance", async () => { await api(`/api/compliance/${b.dataset.delCo}`, { method: "DELETE" }); toast("Deleted.", "success"); renderCompliance(); }));
}

async function renderCompliance() {
  setHeader("Compliance Centre", "Track statutory filings and monitor near-term deadline exposure.");
  const { data, urgent_alerts } = await api("/api/compliance");
  const alertBanner = urgent_alerts.length
    ? `<div class="card" style="background:#FFF8F0;border-left:4px solid #E87722;"><strong>Deadlines within 7 days:</strong> ${urgent_alerts.map((a) => `${a.client} (${a.tax_type} - ${a.deadline})`).join(" | ")}</div>`
    : "";

  document.getElementById("module-content").innerHTML = alertBanner + tableShell(
    `<div class="module-top card"><input class="input" placeholder="Search compliance" id="comp-search"><div class="spacer"></div><button class="btn btn-primary" id="add-comp">Add Compliance Record</button></div>`,
    ["ID", "Client", "Tax Type", "Tax Period", "Deadline", "Filing Date", "Days Remaining", "Status", "Actions"],
    data.map((c) => {
      const badge = c.days_remaining == null ? "" : c.days_remaining < 0 ? '<span class="badge badge-red">OVERDUE</span>' : `<span class="badge ${c.days_remaining <= 7 ? "badge-red" : c.days_remaining <= 14 ? "badge-amber" : "badge-green"}">${c.days_remaining}</span>`;
      return `<tr><td>${c.id}</td><td>${c.client_name || ""}</td><td>${c.tax_type}</td><td>${c.tax_period || ""}</td><td>${c.filing_deadline || ""}</td><td>${c.filing_date || ""}</td><td>${badge}</td><td><span class="badge ${badgeClass(c.status)}">${c.status}</span></td><td><button class="btn btn-secondary btn-sm" data-edit-co="${c.id}">Edit</button><button class="btn btn-secondary btn-sm" data-sub-co="${c.id}">Mark Submitted</button><button class="btn btn-secondary btn-sm" data-ack-co="${c.id}">Mark Acknowledged</button><button class="btn btn-danger btn-sm" data-del-co="${c.id}">Delete</button></td></tr>`;
    })
  );

  document.getElementById("add-comp").onclick = () => openComplianceForm();
  bindComplianceActions(data);

  document.getElementById("comp-search").oninput = async (e) => {
    const q = e.target.value;
    const fresh = await api(`/api/compliance?q=${encodeURIComponent(q)}`);
    document.querySelector("tbody").innerHTML = complianceRows(fresh.data);
    bindComplianceActions(fresh.data);
  };
}

async function openComplianceForm(item = null) {
  const assignableClientOptions = await getAssignableClientOptions();
  if (!item && assignableClientOptions.length === 0) {
    toast("Please add a client in Client Register before creating a compliance record.", "warning");
    return;
  }

  const taxTypeOptions = [
    "VAT",
    "PAYE",
    "Corporate Income Tax",
    "Withholding Tax",
    "Annual Return",
    "Other",
  ];

  const taxPeriodOptions = [
    "Monthly",
    "Quarterly",
    "Annual",
    "Custom",
  ];

  openFormModal(item ? "Edit Compliance" : "Add Compliance", [
    { name: "client_id", label: "Client", type: "select", options: assignableClientOptions, required: true, placeholder: "Select client" },
    { name: "tax_type", label: "Tax Type", type: "select", options: taxTypeOptions, required: true, placeholder: "Select tax type" },
    { name: "tax_period", label: "Tax Period", type: "select", options: taxPeriodOptions, placeholder: "Select tax period" },
    { name: "filing_deadline", label: "Filing Deadline", type: "date" },
    { name: "filing_date", label: "Filing Date", type: "date" },
    { name: "status", label: "Status", type: "select", options: ["Pending", "Submitted", "Acknowledged"] },
    { name: "notes", label: "Notes", type: "textarea" },
  ], item, async (payload) => {
    const method = item ? "PUT" : "POST";
    const url = item ? `/api/compliance/${item.id}` : "/api/compliance";
    await api(url, { method, body: JSON.stringify(payload) });
    toast(`Compliance record ${item ? "updated" : "created"}.`, "success");
    renderCompliance();
  });
}

async function renderUsers() {
  setHeader("Users", "ADMIN ONLY");
  const [usersRes, logsRes] = await Promise.all([api("/api/users"), api("/api/users/activity-log")]);
  const users = usersRes.data;
  const esc = (v) => String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const activityRows = logsRes.data.map((l) => {
    const action = l.action || "";
    const actionClass =
      action.toLowerCase().includes("delete") ? "badge-red" :
      action.toLowerCase().includes("update") ? "badge-amber" :
      action.toLowerCase().includes("create") ? "badge-green" :
      "badge-grey";
    const when = (l.created_at || "").replace("T", " ").slice(0, 19);
    const entity = `${l.entity_type || ""}${l.entity_id ? `#${l.entity_id}` : ""}`;
    return `<tr>
      <td class="col-when">${esc(when)}</td>
      <td class="col-user">${esc(l.username || "")}</td>
      <td class="col-action"><span class="badge ${actionClass}">${esc(action)}</span></td>
      <td class="col-entity"><span class="badge badge-navy">${esc(entity)}</span></td>
      <td class="col-detail"><span class="activity-detail" title="${esc(l.detail || "")}">${esc(l.detail || "")}</span></td>
    </tr>`;
  }).join("");

  const activeUsers = users.filter((u) => u.status === "Active").length;
  const disabledUsers = users.filter((u) => u.status !== "Active").length;
  const adminUsers = users.filter((u) => u.role === "Administrator").length;
  const mustResetUsers = users.filter((u) => Boolean(u.must_reset)).length;

  const renderUserRows = (rows) => rows.map((u) => {
    const fullName = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || "User";
    const initials = fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "U";

    return `<tr>
      <td class="col-id">${u.id}</td>
      <td class="col-name">
        <div class="user-name-cell">
          <span class="user-initial">${esc(initials)}</span>
          <span class="user-full-name">${esc(u.first_name || "")}</span>
        </div>
      </td>
      <td class="col-surname">${esc(u.last_name || "")}</td>
      <td class="col-username">${esc(u.username || "")}</td>
      <td class="col-email">${esc(u.email || "")}</td>
      <td class="col-role"><span class="badge ${badgeClass(u.role)}">${esc(u.role || "")}</span></td>
      <td class="col-status"><span class="badge ${badgeClass(u.status)}">${esc(u.status || "")}</span></td>
      <td class="col-reset"><span class="badge ${u.must_reset ? "badge-amber" : "badge-green"}">${u.must_reset ? "Yes" : "No"}</span></td>
      <td class="col-actions">
        <div class="users-actions-wrap">
          <button class="btn btn-secondary btn-sm" data-edit-u="${u.id}">Edit</button>
          <button class="btn btn-secondary btn-sm" data-toggle-u="${u.id}">${u.status === "Active" ? "Disable" : "Enable"}</button>
          <button class="btn btn-secondary btn-sm" data-pass-u="${u.id}">Set Password</button>
          <button class="btn btn-danger btn-sm" data-del-u="${u.id}">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join("") || '<tr><td colspan="9">No users found.</td></tr>';

  const bindUserActions = (rows) => {
    document.querySelectorAll("[data-edit-u]").forEach((b) => b.onclick = () => openUserForm(rows.find((x) => x.id == b.dataset.editU)));
    document.querySelectorAll("[data-toggle-u]").forEach((b) => b.onclick = async () => { await api(`/api/users/${b.dataset.toggleU}/toggle-status`, { method: "PUT", body: JSON.stringify({}) }); toast("User status updated.", "success"); renderUsers(); });
    document.querySelectorAll("[data-pass-u]").forEach((b) => b.onclick = () => openPasswordForm(b.dataset.passU));
    document.querySelectorAll("[data-del-u]").forEach((b) => b.onclick = () => twoStepDelete("User", async () => { await api(`/api/users/${b.dataset.delU}`, { method: "DELETE" }); toast("User deleted.", "success"); renderUsers(); }));
  };

  document.getElementById("module-content").innerHTML = `
    <div class="card users-summary-grid">
      <div class="users-stat"><span>Total Users</span><strong>${users.length}</strong></div>
      <div class="users-stat"><span>Active</span><strong>${activeUsers}</strong></div>
      <div class="users-stat"><span>Disabled</span><strong>${disabledUsers}</strong></div>
      <div class="users-stat"><span>Administrators</span><strong>${adminUsers}</strong></div>
      <div class="users-stat"><span>Must Reset</span><strong>${mustResetUsers}</strong></div>
    </div>
    <div class="module-top card users-topbar">
      <input class="input users-search" placeholder="Search users by name, username, email" id="user-search">
      <div class="spacer"></div>
      <button class="btn btn-primary" id="add-user">Add User</button>
    </div>
    ${tableShell("", ["ID", "Name", "Surname", "Username", "Email", "Role", "Status", "Must Reset", "Actions"], [renderUserRows(users)], "", "table-users")}
    <div class="card"><h3>Activity Log</h3>
      <div class="table-wrap"><table class="table-activity-log"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead><tbody>${activityRows || '<tr><td colspan="5">No activity logged yet.</td></tr>'}</tbody></table></div>
    </div>
  `;

  document.getElementById("add-user").onclick = () => openUserForm();
  bindUserActions(users);

  document.getElementById("user-search").oninput = (e) => {
    const q = String(e.target.value || "").trim().toLowerCase();
    const filtered = users.filter((u) => {
      const fullName = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
      return fullName.includes(q)
        || String(u.username || "").toLowerCase().includes(q)
        || String(u.email || "").toLowerCase().includes(q)
        || String(u.role || "").toLowerCase().includes(q)
        || String(u.status || "").toLowerCase().includes(q);
    });
    document.querySelector(".table-users tbody").innerHTML = renderUserRows(filtered);
    bindUserActions(filtered);
  };
}

function openUserForm(item = null) {
  openFormModal(item ? "Edit User" : "Add User", [
    { name: "first_name", label: "Name", required: true },
    { name: "last_name", label: "Surname", required: true },
    { name: "username", label: "Username" },
    { name: "email", label: "Email", type: "email" },
    { name: "role", label: "Role", type: "select", options: ["User", "Administrator"] },
    { name: "status", label: "Status", type: "select", options: ["Active", "Disabled"] },
    { name: "must_reset", label: "Must Reset", type: "select", options: ["false", "true"] },
    ...(item ? [] : [{ name: "password", label: "Password", type: "password" }]),
  ], item, async (payload) => {
    payload.must_reset = payload.must_reset === "true";
    const method = item ? "PUT" : "POST";
    const url = item ? `/api/users/${item.id}` : "/api/users";
    await api(url, { method, body: JSON.stringify(payload) });
    toast(`User ${item ? "updated" : "created"}.`, "success");
    renderUsers();
  });
}

function openPasswordForm(id) {
  openFormModal("Set Password", [
    { name: "password", label: "New Password", type: "password" },
    { name: "must_reset", label: "Force Reset Next Login", type: "select", options: ["true", "false"] },
  ], null, async (payload) => {
    payload.must_reset = payload.must_reset === "true";
    await api(`/api/users/${id}/set-password`, { method: "PUT", body: JSON.stringify(payload) });
    toast("Password updated.", "success");
    renderUsers();
  });
}

async function renderAccount() {
  setHeader("Account", "View profile and manage your password securely.");
  const { data } = await api("/api/account");
  const esc = (v) => String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || data.username;
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "U";
  const memberSince = (data.created_at || "").slice(0, 10);
  document.getElementById("module-content").innerHTML = `
    <div class="card account-card">
      <div class="account-profile-top">
        <div class="account-avatar" aria-hidden="true">${esc(initials)}</div>
        <div class="account-identity">
          <h3>${esc(fullName)}</h3>
          <p class="account-subline">${esc(data.email)}</p>
        </div>
        <div class="account-role-wrap">
          <span class="badge ${badgeClass(data.role)}">${esc(data.role)}</span>
        </div>
      </div>
      <div class="account-grid">
        <div class="account-item">
          <span class="account-label">Username</span>
          <span class="account-value">${esc(data.username)}</span>
        </div>
        <div class="account-item">
          <span class="account-label">Member Since</span>
          <span class="account-value">${esc(memberSince || "N/A")}</span>
        </div>
        <div class="account-item">
          <span class="account-label">Name</span>
          <span class="account-value">${esc(data.first_name || "N/A")}</span>
        </div>
        <div class="account-item">
          <span class="account-label">Surname</span>
          <span class="account-value">${esc(data.last_name || "N/A")}</span>
        </div>
      </div>
    </div>
    <div class="card account-password-card">
      <h3>Change Password</h3>
      <p class="account-password-note">Use a strong password with at least 8 characters, uppercase, lowercase, number, and symbol.</p>
      <form id="change-password-form">
        <div class="account-password-grid">
          <div>
            <label class="label">Current Password</label><input class="input" name="current_password" type="password" required>
          </div>
          <div>
            <label class="label">New Password</label><input class="input" name="new_password" type="password" required>
          </div>
          <div class="account-password-confirm">
            <label class="label">Confirm New Password</label><input class="input" name="confirm_password" type="password" required>
          </div>
        </div>
        <div class="modal-actions"><button class="btn btn-primary" type="submit">Update Password</button></div>
      </form>
    </div>
  `;

  document.getElementById("change-password-form").onsubmit = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    await api("/api/account/change-password", { method: "PUT", body: JSON.stringify(payload) });
    toast("Password updated successfully.", "success");
    e.target.reset();
  };
}

async function renderModule() {
  try {
    if (state.module === "dashboard") return renderDashboard();
    if (state.module === "analytics") return renderAnalytics();
    if (state.module === "prospects") return renderProspects();
    if (state.module === "quotations") return renderQuotations();
    if (state.module === "clients") return renderClients();
    if (state.module === "projects") return renderProjects();
    if (state.module === "invoices") return renderInvoices();
    if (state.module === "compliance") return renderCompliance();
    if (state.module === "users") return renderUsers();
    if (state.module === "account") return renderAccount();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function init() {
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");

  sidebarToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = sidebar?.classList.contains("open");
    setSidebarOpen(!isOpen);
  });

  document.addEventListener("click", (event) => {
    if (window.innerWidth > 768) return;
    if (!sidebar?.classList.contains("open")) return;
    if (!sidebar.contains(event.target) && !sidebarToggle?.contains(event.target)) {
      closeSidebar();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeSidebar();
    }
  });

  state.currentUser = (await api("/api/account")).data;
  if (mustResetNotice) {
    toast("Password reset is recommended for your account.", "warning");
  }
  if (state.currentUser.role !== "Administrator" && state.module === "users") {
    state.module = "dashboard";
  }
  buildNav();
  renderModule();
}

init();
