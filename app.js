/* ═══════════════════════════════════════════════════════════
   FINSAVE — app.js
═══════════════════════════════════════════════════════════ */

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── STATE ────────────────────────────────────────────────────
let currentUser = null;
let categories = [];
let viewMonth = new Date();
viewMonth.setDate(1);
let appInitialized = false;
let expectedSalary = 0;
let selectedColor = '#d4a853';
let editingCategoryId = null;
let incomeType = 'income'; // 'income' | 'reimbursement'

const COLORS = [
  '#d4a853', '#e05c5c', '#4ecb7b', '#5b9cf6',
  '#9b72f5', '#f97316', '#06b6d4', '#ec4899',
  '#a3e635', '#fb923c', '#f43f5e', '#8b5cf6'
];

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  toastTimer = setTimeout(() => t.className = 'toast hidden', 3500);
}

// ── FORMAT ───────────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

// ── MOBILE MENU ───────────────────────────────────────────────
document.getElementById('btn-menu-open').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('active');
});
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}
document.getElementById('btn-menu-close').addEventListener('click', closeSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

// ── AUTH ─────────────────────────────────────────────────────
document.getElementById('btn-google-login').addEventListener('click', async () => {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: SITE_URL }
  });
  if (error) showToast('Erreur : ' + error.message, 'error');
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = window.location.pathname;
});

sb.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    currentUser = session.user;
    if (!appInitialized) {
      appInitialized = true;
      await initApp();
    }
    showScreen('app');
  } else {
    appInitialized = false;
    showScreen('auth');
    currentUser = null;
  }
});

function showScreen(name) {
  document.getElementById('auth-screen').classList.toggle('active', name === 'auth');
  document.getElementById('app-screen').classList.toggle('active', name === 'app');
}

// ── INIT ─────────────────────────────────────────────────────
async function initApp() {
  const meta = currentUser.user_metadata;
  document.getElementById('user-name').textContent = meta.full_name || meta.name || 'Utilisateur';
  document.getElementById('user-email').textContent = currentUser.email || '';
  const avatar = document.getElementById('user-avatar');
  if (meta.avatar_url || meta.picture) {
    avatar.innerHTML = `<img src="${meta.avatar_url || meta.picture}" alt="avatar"/>`;
  } else {
    avatar.textContent = (meta.full_name || 'U')[0].toUpperCase();
  }

  await loadCategories();
  if (categories.length === 0) await seedDefaultCategories();
  await loadUserSettings();

  renderDashboard();
  populateCategorySelects();
}

// ── USER SETTINGS (salaire prévu) ────────────────────────────
async function loadUserSettings() {
  const { data } = await sb.from('user_settings')
    .select('expected_salary')
    .eq('user_id', currentUser.id)
    .single();
  expectedSalary = data?.expected_salary || 0;
  document.getElementById('expected-salary').value = expectedSalary || '';
}

async function saveExpectedSalary(value) {
  expectedSalary = parseFloat(value) || 0;
  await sb.from('user_settings').upsert({
    user_id: currentUser.id,
    expected_salary: expectedSalary,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  renderDashboard();
}

document.getElementById('expected-salary').addEventListener('change', (e) => {
  saveExpectedSalary(e.target.value);
});

// ── SUPABASE HELPERS ─────────────────────────────────────────
async function loadCategories() {
  const { data } = await sb.from('categories')
    .select('*').eq('user_id', currentUser.id).order('name');
  categories = data || [];
}

function getCatById(id) { return categories.find(c => c.id === id) || null; }

function monthRange(date) {
  const y = date.getFullYear(), m = date.getMonth();
  return {
    from: new Date(y, m, 1).toISOString().slice(0, 10),
    to: new Date(y, m + 1, 0).toISOString().slice(0, 10)
  };
}

async function getExpensesForMonth(date) {
  const { from, to } = monthRange(date);
  const { data } = await sb.from('expenses').select('*')
    .eq('user_id', currentUser.id)
    .gte('date', from).lte('date', to)
    .order('date', { ascending: false });
  return data || [];
}

async function getIncomesForMonth(date) {
  const { from, to } = monthRange(date);
  const { data } = await sb.from('incomes').select('*')
    .eq('user_id', currentUser.id)
    .gte('date', from).lte('date', to)
    .order('date', { ascending: false });
  return data || [];
}

// ── DEFAULT CATEGORIES ────────────────────────────────────────
async function seedDefaultCategories() {
  const { count } = await sb.from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id);
  if (count > 0) return;

  const defaults = [
    { name: 'Logement', color: '#5b9cf6', budget_limit: 800 },
    { name: 'Alimentation', color: '#4ecb7b', budget_limit: 400 },
    { name: 'Transport', color: '#d4a853', budget_limit: 150 },
    { name: 'Loisirs', color: '#9b72f5', budget_limit: 100 },
    { name: 'Santé', color: '#06b6d4', budget_limit: 50 },
    { name: 'Abonnements', color: '#f97316', budget_limit: 80 },
    { name: 'Inconnu', color: '#4a4e63', budget_limit: 0 },
  ];
  await sb.from('categories').insert(defaults.map(d => ({ ...d, user_id: currentUser.id })));
  await loadCategories();
}

// ── NAVIGATION ────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    closeSidebar();
    if (view === 'dashboard') renderDashboard();
    if (view === 'expenses') { renderExpenseList(); populateCategorySelects(); }
    if (view === 'incomes') { renderIncomesList(); populateCategorySelects(); }
    if (view === 'categories') renderCategories();
    if (view === 'history') renderHistory();
  });
});

// ── MONTH NAV ─────────────────────────────────────────────────
function updateMonthDisplay() {
  const label = `${MONTHS_FR[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  document.getElementById('current-month-display').textContent = label;
  document.getElementById('dashboard-month-label').textContent = `Bilan — ${label}`;
}

document.getElementById('prev-month').addEventListener('click', () => {
  viewMonth.setMonth(viewMonth.getMonth() - 1);
  renderDashboard();
});
document.getElementById('next-month').addEventListener('click', () => {
  const next = new Date(viewMonth);
  next.setMonth(next.getMonth() + 1);
  const now = new Date(); now.setDate(1);
  if (next <= now) { viewMonth = next; renderDashboard(); }
});

// ── DASHBOARD ─────────────────────────────────────────────────
async function renderDashboard() {
  updateMonthDisplay();

  const [expenses, allIncomes] = await Promise.all([
    getExpensesForMonth(viewMonth),
    getIncomesForMonth(viewMonth)
  ]);

  const incomes = allIncomes.filter(i => i.type === 'income' || !i.type);
  const reimbursements = allIncomes.filter(i => i.type === 'reimbursement');

  const totalGross = expenses.reduce((a, e) => a + e.amount, 0);
  const totalReimb = reimbursements.reduce((a, i) => a + i.amount, 0);
  const totalNet = Math.max(0, totalGross - totalReimb);
  const totalIncomes = incomes.reduce((a, i) => a + i.amount, 0);
  const totalBudget = categories.reduce((a, c) => a + (c.budget_limit || 0), 0);

  const savingsExpected = expectedSalary - totalBudget;
  const savingsReal = totalIncomes - totalNet;

  // Cards
  document.getElementById('total-spent').textContent = fmt(totalGross);
  document.getElementById('total-net').textContent = fmt(totalNet);
  document.getElementById('real-income-display').textContent = fmt(totalIncomes);

  document.getElementById('reimbursements-info').textContent =
    totalReimb > 0 ? `− ${fmt(totalReimb)} remboursements` : 'Ce mois-ci';

  const expEl = document.getElementById('savings-expected');
  expEl.textContent = fmt(savingsExpected);
  expEl.style.color = savingsExpected >= 0 ? 'var(--green)' : 'var(--red)';

  const realEl = document.getElementById('savings-real');
  realEl.textContent = fmt(savingsReal);
  realEl.style.color = savingsReal >= 0 ? 'var(--green)' : 'var(--red)';

  // Budget bars — dépenses nettes par catégorie
  const spentByCat = {};
  expenses.forEach(e => {
    spentByCat[e.category_id] = (spentByCat[e.category_id] || 0) + e.amount;
  });
  const reimbByCat = {};
  reimbursements.forEach(i => {
    if (i.category_id) reimbByCat[i.category_id] = (reimbByCat[i.category_id] || 0) + i.amount;
  });

  const bars = document.getElementById('budget-bars');
  bars.innerHTML = '';
  categories.forEach(cat => {
    const gross = spentByCat[cat.id] || 0;
    const reimb = reimbByCat[cat.id] || 0;
    const net = Math.max(0, gross - reimb);
    if (!cat.budget_limit && gross === 0) return;

    const rawPct = cat.budget_limit ? (net / cat.budget_limit) * 100 : 200;
    const fillPct = Math.min(100, rawPct);
    const color = rawPct > 100 ? 'var(--red)' : 'var(--green)';

    const reimbNote = reimb > 0 ? `<span class="budget-bar-reimbursed">(−${fmt(reimb)} remb.)</span>` : '';

    bars.innerHTML += `
      <div class="budget-bar-item">
        <div class="budget-bar-header">
          <div class="budget-bar-name">
            <span class="cat-dot" style="background:${cat.color}"></span>
            ${cat.name}
          </div>
          <div class="budget-bar-amounts">
            <strong>${fmt(net)}</strong>${cat.budget_limit != null ? ` / ${fmt(cat.budget_limit)}` : ''}
            ${reimbNote}
          </div>
        </div>
        ${cat.budget_limit != null ? `
        <div class="budget-track">
          <div class="budget-fill" style="width:${fillPct}%;background:${color}"></div>
        </div>` : ''}
      </div>`;
  });
  if (!bars.innerHTML) {
    bars.innerHTML = '<p class="empty-state"><span class="empty-icon">🎯</span>Définissez des budgets dans "Catégories & Budgets"</p>';
  }

  // Recent expenses
  const recent = document.getElementById('recent-expenses');
  recent.innerHTML = '';
  const top = expenses.slice(0, 6);
  if (!top.length) {
    recent.innerHTML = '<p class="empty-state"><span class="empty-icon">💸</span>Aucune dépense ce mois-ci</p>';
  } else {
    top.forEach(e => recent.appendChild(makeExpenseItem(e)));
  }
}

// ── EXPENSES ──────────────────────────────────────────────────
document.getElementById('exp-date').valueAsDate = new Date();

document.getElementById('btn-add-expense').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const date = document.getElementById('exp-date').value;
  const cat_id = document.getElementById('exp-category').value;
  const desc = document.getElementById('exp-desc').value.trim();

  if (!amount || amount <= 0) return showToast('Montant invalide', 'error');
  if (!date) return showToast('Date requise', 'error');
  if (!cat_id) return showToast('Sélectionnez une catégorie', 'error');

  const { error } = await sb.from('expenses').insert({
    user_id: currentUser.id, amount, date,
    category_id: cat_id, description: desc || null
  });
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }

  showToast('Dépense enregistrée ✓');
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-desc').value = '';
  renderExpenseList();
});

async function renderExpenseList() {
  const expenses = await getExpensesForMonth(new Date());
  const list = document.getElementById('all-expenses-list');
  list.innerHTML = '';
  if (!expenses.length) {
    list.innerHTML = '<p class="empty-state"><span class="empty-icon">💸</span>Aucune dépense ce mois-ci</p>';
    return;
  }
  expenses.forEach(e => list.appendChild(makeExpenseItem(e, true)));
}

function makeExpenseItem(e, withDelete = false) {
  const cat = getCatById(e.category_id);
  const div = document.createElement('div');
  div.className = 'expense-item';
  const d = new Date(e.date + 'T00:00:00');
  const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  div.innerHTML = `
    <div class="expense-cat-dot" style="background:${cat?.color || '#666'}"></div>
    <div class="expense-info">
      <div class="expense-desc">${e.description || cat?.name || 'Dépense'}</div>
      <div class="expense-meta">${cat?.name || '—'} · ${dateStr}</div>
    </div>
    <div class="expense-amount">${fmt(e.amount)}</div>
    ${withDelete ? `<button class="btn-delete-exp" title="Supprimer">×</button>` : ''}
  `;
  if (withDelete) {
    div.querySelector('.btn-delete-exp').addEventListener('click', async () => {
      if (!confirm('Supprimer cette dépense ?')) return;
      await sb.from('expenses').delete().eq('id', e.id);
      showToast('Dépense supprimée');
      renderExpenseList();
    });
  }
  return div;
}

// ── INCOMES & REIMBURSEMENTS ──────────────────────────────────
document.getElementById('inc-date').valueAsDate = new Date();

// Type toggle
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    incomeType = btn.dataset.type;
    document.getElementById('inc-type').value = incomeType;
    const catGroup = document.getElementById('inc-cat-group');
    catGroup.style.display = incomeType === 'reimbursement' ? 'flex' : 'none';
    document.getElementById('inc-desc').placeholder =
      incomeType === 'income' ? 'Ex: Salaire novembre' : 'Ex: Remboursement essence';
  });
});

document.getElementById('btn-add-income').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('inc-amount').value);
  const date = document.getElementById('inc-date').value;
  const desc = document.getElementById('inc-desc').value.trim();
  const type = document.getElementById('inc-type').value;
  const cat_id = document.getElementById('inc-category').value || null;

  if (!amount || amount <= 0) return showToast('Montant invalide', 'error');
  if (!date) return showToast('Date requise', 'error');
  if (type === 'reimbursement' && !cat_id) return showToast('Sélectionnez la catégorie remboursée', 'error');

  const { error } = await sb.from('incomes').insert({
    user_id: currentUser.id, amount, date,
    description: desc || null, type,
    category_id: type === 'reimbursement' ? cat_id : null
  });
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }

  showToast(type === 'income' ? 'Revenu enregistré ✓' : 'Remboursement enregistré ✓');
  document.getElementById('inc-amount').value = '';
  document.getElementById('inc-desc').value = '';
  renderIncomesList();
});

async function renderIncomesList() {
  const allIncomes = await getIncomesForMonth(new Date());
  const incomes = allIncomes.filter(i => i.type === 'income' || !i.type);
  const reimbs = allIncomes.filter(i => i.type === 'reimbursement');

  renderIncomeGroup('incomes-list', incomes, 'income');
  renderIncomeGroup('reimbursements-list', reimbs, 'reimbursement');
}

function renderIncomeGroup(containerId, items, type) {
  const list = document.getElementById(containerId);
  list.innerHTML = '';
  if (!items.length) {
    const icon = type === 'income' ? '💰' : '↩️';
    const msg = type === 'income' ? 'Aucun revenu ce mois-ci' : 'Aucun remboursement ce mois-ci';
    list.innerHTML = `<p class="empty-state"><span class="empty-icon">${icon}</span>${msg}</p>`;
    return;
  }
  items.forEach(inc => {
    const cat = getCatById(inc.category_id);
    const div = document.createElement('div');
    div.className = 'expense-item';
    const d = new Date(inc.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const tagClass = type === 'income' ? 'tag-income' : 'tag-reimbursement';
    const tagLabel = type === 'income' ? 'REVENU' : 'REMB.';
    const dotColor = type === 'income' ? 'var(--green)' : (cat?.color || 'var(--blue)');
    const metaCat = type === 'reimbursement' && cat ? `${cat.name} · ` : '';
    div.innerHTML = `
      <div class="expense-cat-dot" style="background:${dotColor}"></div>
      <div class="expense-info">
        <div class="expense-desc">${inc.description || (type === 'income' ? 'Revenu' : 'Remboursement')}</div>
        <div class="expense-meta">${metaCat}${dateStr} <span class="tag ${tagClass}">${tagLabel}</span></div>
      </div>
      <div class="expense-amount positive">+${fmt(inc.amount)}</div>
      <button class="btn-delete-exp" title="Supprimer">×</button>
    `;
    div.querySelector('.btn-delete-exp').addEventListener('click', async () => {
      if (!confirm('Supprimer cet enregistrement ?')) return;
      await sb.from('incomes').delete().eq('id', inc.id);
      showToast('Supprimé');
      renderIncomesList();
    });
    list.appendChild(div);
  });
}

// ── CATEGORIES ────────────────────────────────────────────────
function buildColorPicker() {
  const picker = document.getElementById('color-picker');
  picker.innerHTML = '';
  COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
    s.style.background = c;
    s.addEventListener('click', () => {
      selectedColor = c;
      document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('selected'));
      s.classList.add('selected');
    });
    picker.appendChild(s);
  });
}

document.getElementById('btn-add-category').addEventListener('click', () => {
  editingCategoryId = null;
  document.getElementById('modal-cat-title').textContent = 'Nouvelle catégorie';
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-budget').value = '';
  selectedColor = COLORS[0];
  buildColorPicker();
  document.getElementById('modal-category').classList.remove('hidden');
});

document.getElementById('btn-cancel-category').addEventListener('click', () => {
  document.getElementById('modal-category').classList.add('hidden');
});

document.getElementById('btn-save-category').addEventListener('click', async () => {
  const name = document.getElementById('cat-name').value.trim();
  const budget = document.getElementById('cat-budget').value;
  // Allow 0 as valid budget (means no limit / tracked but no cap)
  const budget_limit = budget !== '' ? parseFloat(budget) : null;

  if (!name) return showToast('Nom requis', 'error');

  if (editingCategoryId) {
    await sb.from('categories').update({ name, budget_limit, color: selectedColor })
      .eq('id', editingCategoryId);
    showToast('Catégorie mise à jour ✓');
  } else {
    await sb.from('categories').insert({
      user_id: currentUser.id, name, budget_limit, color: selectedColor
    });
    showToast('Catégorie créée ✓');
  }
  document.getElementById('modal-category').classList.add('hidden');
  await loadCategories();
  renderCategories();
  populateCategorySelects();
});

function renderCategories() {
  const grid = document.getElementById('categories-list');
  grid.innerHTML = '';
  if (!categories.length) {
    grid.innerHTML = '<p class="empty-state"><span class="empty-icon">🏷️</span>Aucune catégorie</p>';
    return;
  }
  categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.style.borderLeft = `3px solid ${cat.color || '#666'}`;
    const budgetDisplay = cat.budget_limit != null ? fmt(cat.budget_limit) : '—';
    card.innerHTML = `
      <div class="cat-card-header">
        <div class="cat-card-name">
          <span class="cat-dot" style="background:${cat.color}"></span>
          ${cat.name}
        </div>
        <button class="btn-delete-cat">✕</button>
      </div>
      <div class="cat-budget-label">Budget mensuel</div>
      <div class="cat-budget-amount">${budgetDisplay}</div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-cat')) return;
      editingCategoryId = cat.id;
      document.getElementById('modal-cat-title').textContent = 'Modifier';
      document.getElementById('cat-name').value = cat.name;
      document.getElementById('cat-budget').value = cat.budget_limit ?? '';
      selectedColor = cat.color || COLORS[0];
      buildColorPicker();
      document.getElementById('modal-category').classList.remove('hidden');
    });
    card.querySelector('.btn-delete-cat').addEventListener('click', async () => {
      if (!confirm(`Supprimer "${cat.name}" ?`)) return;
      await sb.from('categories').delete().eq('id', cat.id);
      await loadCategories();
      renderCategories();
      populateCategorySelects();
      showToast('Catégorie supprimée');
    });
    grid.appendChild(card);
  });
}

// ── HISTORY ───────────────────────────────────────────────────
async function renderHistory() {
  const histEl = document.getElementById('history-list');
  histEl.innerHTML = '<p class="empty-state"><span class="empty-icon">⏳</span>Chargement...</p>';

  const [{ data: allExpenses }, { data: allIncomes }] = await Promise.all([
    sb.from('expenses').select('*').eq('user_id', currentUser.id).order('date'),
    sb.from('incomes').select('*').eq('user_id', currentUser.id).order('date')
  ]);

  if (!allExpenses?.length && !allIncomes?.length) {
    histEl.innerHTML = '<p class="empty-state"><span class="empty-icon">📅</span>Aucun historique disponible</p>';
    return;
  }

  // Group by month key
  const months = {};
  const ensure = (key) => {
    if (!months[key]) months[key] = { expenses: [], incomes: [], reimbursements: [] };
  };
  (allExpenses || []).forEach(e => {
    const key = e.date.slice(0, 7);
    ensure(key);
    months[key].expenses.push(e);
  });
  (allIncomes || []).forEach(i => {
    const key = i.date.slice(0, 7);
    ensure(key);
    if (i.type === 'reimbursement') months[key].reimbursements.push(i);
    else months[key].incomes.push(i);
  });

  histEl.innerHTML = '';
  Object.keys(months).sort().reverse().forEach(key => {
    const [y, m] = key.split('-');
    const data = months[key];
    const totalGross = data.expenses.reduce((a, e) => a + e.amount, 0);
    const totalReimb = data.reimbursements.reduce((a, i) => a + i.amount, 0);
    const totalNet = Math.max(0, totalGross - totalReimb);
    const totalInc = data.incomes.reduce((a, i) => a + i.amount, 0);
    const savings = totalInc - totalNet;
    const label = `${MONTHS_FR[parseInt(m) - 1]} ${y}`;
    const savClass = savings >= 0 ? 'savings-positive' : 'savings-negative';
    const savLabel = savings >= 0 ? `Épargne ${fmt(savings)}` : `Déficit ${fmt(Math.abs(savings))}`;

    const card = document.createElement('div');
    card.className = 'history-month-card';
    card.innerHTML = `
      <div class="history-card-header">
        <div class="history-card-month">${label}</div>
        <div class="history-card-right">
          ${savings !== 0 || totalInc > 0 ? `<span class="history-card-savings ${savClass}">${savLabel}</span>` : ''}
          <div class="history-card-total">${fmt(totalGross)}</div>
        </div>
      </div>
      <div class="history-card-body">
        <div class="history-stat">
          <div class="history-stat-label">Dépenses brutes</div>
          <div class="history-stat-val">${fmt(totalGross)}</div>
        </div>
        <div class="history-stat">
          <div class="history-stat-label">Remboursements</div>
          <div class="history-stat-val" style="color:var(--green)">−${fmt(totalReimb)}</div>
        </div>
        <div class="history-stat">
          <div class="history-stat-label">Dépenses nettes</div>
          <div class="history-stat-val">${fmt(totalNet)}</div>
        </div>
        <div class="history-stat">
          <div class="history-stat-label">Revenus</div>
          <div class="history-stat-val" style="color:var(--green)">${fmt(totalInc)}</div>
        </div>
        <div class="history-stat">
          <div class="history-stat-label">Épargne réelle</div>
          <div class="history-stat-val" style="color:${savings >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(savings)}</div>
        </div>
      </div>
    `;
    card.querySelector('.history-card-header').addEventListener('click', () => card.classList.toggle('open'));
    histEl.appendChild(card);
  });
}

// ── POPULATE SELECTS ──────────────────────────────────────────
function populateCategorySelects() {
  ['exp-category', 'inc-category'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">Sélectionner...</option>';
    categories.forEach(c => {
      sel.innerHTML += `<option value="${c.id}" ${c.id === val ? 'selected' : ''}>${c.name}</option>`;
    });
  });
}
