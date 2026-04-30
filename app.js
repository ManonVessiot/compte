/* ═══════════════════════════════════════════════════════════
   FINSAVE — Application principale
   ═══════════════════════════════════════════════════════════ */

// ── INIT SUPABASE ────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── STATE ────────────────────────────────────────────────────
let currentUser = null;
let categories = [];
let viewMonth = new Date(); // month currently viewed
viewMonth.setDate(1);

const COLORS = [
  '#d4a853', '#e05c5c', '#4ecb7b', '#5b9cf6',
  '#9b72f5', '#f97316', '#06b6d4', '#ec4899',
  '#a3e635', '#fb923c', '#f43f5e', '#8b5cf6'
];
let selectedColor = COLORS[0];
let editingCategoryId = null;

// ── DOM REFS ─────────────────────────────────────────────────
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const toast = document.getElementById('toast');

// ── TOAST ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toastTimer = setTimeout(() => toast.className = 'toast hidden', 3500);
}

// ── AUTH ─────────────────────────────────────────────────────
document.getElementById('btn-google-login').addEventListener('click', async () => {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: SITE_URL }
  });
  if (error) showToast('Erreur de connexion : ' + error.message, 'error');
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = window.location.pathname; // ← recharge sans le hash
});

let appInitialized = false; // ← ajoute ça près des autres variables d'état

sb.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    currentUser = session.user;
    if (!appInitialized) {        // ← n'init qu'une seule fois
      appInitialized = true;
      await initApp();
    }
    showScreen('app');
  } else {
    appInitialized = false;       // ← reset au logout
    showScreen('auth');
    currentUser = null;
  }
});

// ── NAVIGATION ───────────────────────────────────────────────
function showScreen(name) {
  authScreen.classList.toggle('active', name === 'auth');
  appScreen.classList.toggle('active', name === 'app');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    if (view === 'dashboard') renderDashboard();
    if (view === 'expenses') { renderExpenseList(); populateCategorySelects(); }
    if (view === 'incomes') { renderIncomesList(); }
    if (view === 'fixed') renderFixedCharges();
    if (view === 'categories') renderCategories();
    if (view === 'history') renderHistory();
  });
});

// ── INIT ─────────────────────────────────────────────────────
async function initApp() {
  // User info
  const meta = currentUser.user_metadata;
  document.getElementById('user-name').textContent = meta.full_name || meta.name || 'Utilisateur';
  document.getElementById('user-email').textContent = currentUser.email || '';
  const avatar = document.getElementById('user-avatar');
  if (meta.avatar_url || meta.picture) {
    avatar.innerHTML = `<img src="${meta.avatar_url || meta.picture}" alt="avatar"/>`;
  } else {
    avatar.textContent = (meta.full_name || 'U')[0].toUpperCase();
  }

  // Ensure default categories if first login
  await loadCategories();
  if (categories.length === 0) await seedDefaultCategories();

  renderDashboard();
  populateCategorySelects();
}

// ── SUPABASE HELPERS ─────────────────────────────────────────
async function loadCategories() {
  const { data } = await sb.from('categories')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('name');
  categories = data || [];
}

function getCatById(id) { return categories.find(c => c.id === id) || null; }

function monthRange(date) {
  const y = date.getFullYear(), m = date.getMonth();
  const from = new Date(y, m, 1).toISOString().slice(0, 10);
  const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

async function getExpensesForMonth(date) {
  const { from, to } = monthRange(date);
  const { data } = await sb.from('expenses')
    .select('*')
    .eq('user_id', currentUser.id)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });
  return data || [];
}

let categoriesInitialized = false;

async function seedDefaultCategories() {
  if (categoriesInitialized) return; // déjà fait, on sort

  // Double-vérification directe en base pour éviter les doublons
  const { count } = await sb.from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id);

  if (count > 0) return; // déjà fait, on sort

  const defaults = [
    { name: 'Logement', color: '#5b9cf6', budget_limit: 800 },
    { name: 'Alimentation', color: '#4ecb7b', budget_limit: 400 },
    { name: 'Transport', color: '#d4a853', budget_limit: 150 },
    { name: 'Loisirs', color: '#9b72f5', budget_limit: 100 },
    { name: 'Santé', color: '#e05c5c', budget_limit: 50 },
    { name: 'Abonnements', color: '#06b6d4', budget_limit: 80 },
  ];
  const rows = defaults.map(d => ({ ...d, user_id: currentUser.id }));
  await sb.from('categories').insert(rows);
  categoriesInitialized = true;
  await loadCategories();
}

// ── MONTH NAV ────────────────────────────────────────────────
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function updateMonthDisplay() {
  const label = `${MONTHS_FR[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  document.getElementById('current-month-display').textContent = label;
  document.getElementById('dashboard-month-label').textContent = `Bilan de ${label}`;
}

document.getElementById('prev-month').addEventListener('click', () => {
  viewMonth.setMonth(viewMonth.getMonth() - 1);
  updateMonthDisplay();
  renderDashboard();
});
document.getElementById('next-month').addEventListener('click', () => {
  const next = new Date(viewMonth);
  next.setMonth(next.getMonth() + 1);
  const now = new Date(); now.setDate(1);
  if (next <= now) { viewMonth = next; updateMonthDisplay(); renderDashboard(); }
});

// ── DASHBOARD ────────────────────────────────────────────────
async function renderDashboard() {
  updateMonthDisplay();
  const expenses = await getExpensesForMonth(viewMonth);
  const incomes = await getIncomesForMonth(viewMonth);

  const totalFixed = expenses.filter(e => e.is_fixed).reduce((a, e) => a + e.amount, 0);
  const totalVariable = expenses.filter(e => !e.is_fixed).reduce((a, e) => a + e.amount, 0);
  const total = totalFixed + totalVariable;
  const totalIncomesFixed = incomes.filter(e => e.is_recurring).reduce((a, i) => a + i.amount, 0);
  const totalIncomes = incomes.reduce((a, i) => a + i.amount, 0);
  const balance = totalIncomes - total;

  document.getElementById('total-spent').textContent = fmt(total);
  document.getElementById('total-fixed').textContent = fmt(totalFixed);
  document.getElementById('total-incomes').textContent = fmt(totalIncomes);
  document.getElementById('total-incomes-fixed').textContent = "fixe : " + fmt(totalIncomesFixed);

  const balanceEl = document.getElementById('total-savings');
  balanceEl.textContent = fmt(balance);
  balanceEl.style.color = balance >= 0 ? 'var(--green)' : 'var(--red)';

  // Budget bars
  const bars = document.getElementById('budget-bars');
  const byCategory = {};
  expenses.forEach(e => {
    byCategory[e.category_id] = (byCategory[e.category_id] || 0) + e.amount;
  });

  bars.innerHTML = '';
  let allBudget = 0;
  categories.forEach(cat => {
    allBudget += cat.budget_limit;
    const spent = byCategory[cat.id] || 0;
    //if (!cat.budget_limit && spent === 0) return;
    const rawPct = cat.budget_limit ? (spent / cat.budget_limit) * 100 : spent > 0 ? 200 : 0;
    const fillPct = Math.min(100, rawPct); // pour la largeur de la barre (max 100%)
    const color = rawPct > 100 ? 'var(--red)' : 'var(--green)'; // rouge seulement si dépassé
    bars.innerHTML += `
      <div class="budget-bar-item">
        <div class="budget-bar-header">
          <div class="budget-bar-name">
            <span class="cat-dot" style="background:${cat.color}"></span>
            ${cat.name}
          </div>
          <div class="budget-bar-amounts">
            <strong>${fmt(spent)}</strong>${cat.budget_limit != null ? ` / ${fmt(cat.budget_limit)}` : ''}
          </div>
        </div>
        ${cat.budget_limit != null ? `
        <div class="budget-track">
          <div class="budget-fill" style="width:${fillPct}%;background:${color}"></div>
        </div>` : ''}
      </div>`;
  });
  if (!bars.innerHTML) bars.innerHTML = '<p class="empty-state"><span class="empty-icon">🎯</span>Définissez des budgets dans "Catégories & Budgets"</p>';
  document.getElementById('total-saving-planned').textContent = "/ " + fmt(totalIncomesFixed - allBudget);
  document.getElementById('total-budget-info').textContent = "/ " + fmt(allBudget);

  // Recent expenses
  const recent = document.getElementById('recent-expenses');
  recent.innerHTML = '';
  const top = expenses.slice(0, 8);
  if (!top.length) {
    recent.innerHTML = '<p class="empty-state"><span class="empty-icon">💸</span>Aucune dépense ce mois-ci</p>';
  } else {
    top.forEach(e => recent.appendChild(expenseItem(e)));
  }
}

// ── EXPENSE LIST (add view) ───────────────────────────────────
async function renderExpenseList() {
  const expenses = await getExpensesForMonth(new Date());
  const list = document.getElementById('all-expenses-list');
  list.innerHTML = '';
  if (!expenses.length) {
    list.innerHTML = '<p class="empty-state"><span class="empty-icon">💸</span>Aucune dépense ce mois-ci</p>';
    return;
  }
  expenses.forEach(e => {
    const el = expenseItem(e, true);
    list.appendChild(el);
  });
}

function expenseItem(e, withDelete = false) {
  const cat = getCatById(e.category_id);
  const div = document.createElement('div');
  div.className = 'expense-item';
  const d = new Date(e.date + 'T00:00:00');
  const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  div.innerHTML = `
    <div class="expense-cat-dot" style="background:${cat?.color || '#666'}"></div>
    <div class="expense-info">
      <div class="expense-desc">${e.description || cat?.name || 'Dépense'}</div>
      <div class="expense-meta">
        ${cat?.name || ''}
        <span>·</span> ${dateStr}
        ${e.is_fixed ? '<span class="tag-fixed">FIXE</span>' : ''}
      </div>
    </div>
    <div class="expense-amount">${fmt(e.amount)}</div>
    ${withDelete ? `<button class="btn-delete-exp" data-id="${e.id}" title="Supprimer">×</button>` : ''}
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

// ── ADD EXPENSE ───────────────────────────────────────────────
document.getElementById('exp-date').valueAsDate = new Date();

document.getElementById('btn-add-expense').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const date = document.getElementById('exp-date').value;
  const cat_id = document.getElementById('exp-category').value;
  const desc = document.getElementById('exp-desc').value.trim();
  const is_fixed = document.getElementById('exp-fixed').checked;

  if (!amount || amount <= 0) return showToast('Montant invalide', 'error');
  if (!date) return showToast('Date requise', 'error');
  if (!cat_id) return showToast('Sélectionnez une catégorie', 'error');

  const { error } = await sb.from('expenses').insert({
    user_id: currentUser.id,
    amount, date, category_id: cat_id,
    description: desc || null,
    is_fixed
  });

  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }

  showToast('Dépense enregistrée ✓');
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-desc').value = '';
  document.getElementById('exp-fixed').checked = false;
  renderExpenseList();
});

// ── INCOMES ──────────────────────────────────────────────────
async function getIncomesForMonth(date) {
  const { from, to } = monthRange(date);
  const { data } = await sb.from('incomes')
    .select('*')
    .eq('user_id', currentUser.id)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });
  return data || [];
}

document.getElementById('inc-date').valueAsDate = new Date();

document.getElementById('btn-add-income').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('inc-amount').value);
  const date = document.getElementById('inc-date').value;
  const desc = document.getElementById('inc-desc').value.trim();
  const is_recurring = document.getElementById('inc-recurring').checked;

  if (!amount || amount <= 0) return showToast('Montant invalide', 'error');
  if (!date) return showToast('Date requise', 'error');

  const { error } = await sb.from('incomes').insert({
    user_id: currentUser.id,
    amount, date,
    description: desc || null,
    is_recurring
  });

  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }

  showToast('Revenu enregistré ✓');
  document.getElementById('inc-amount').value = '';
  document.getElementById('inc-desc').value = '';
  document.getElementById('inc-recurring').checked = false;
  renderIncomesList();
});

async function renderIncomesList() {
  const incomes = await getIncomesForMonth(new Date());
  const list = document.getElementById('incomes-list');
  list.innerHTML = '';
  if (!incomes.length) {
    list.innerHTML = '<p class="empty-state"><span class="empty-icon">💰</span>Aucun revenu ce mois-ci</p>';
    return;
  }
  incomes.forEach(inc => {
    const div = document.createElement('div');
    div.className = 'expense-item';
    const d = new Date(inc.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    div.innerHTML = `
      <div class="expense-cat-dot" style="background:var(--green)"></div>
      <div class="expense-info">
        <div class="expense-desc">${inc.description || 'Revenu'}</div>
        <div class="expense-meta">
          ${dateStr}
          ${inc.is_recurring ? '<span class="tag-fixed" style="background:rgba(78,203,123,0.15);color:var(--green)">RÉCURRENT</span>' : ''}
        </div>
      </div>
      <div class="expense-amount" style="color:var(--green)">+${fmt(inc.amount)}</div>
      <button class="btn-delete-exp" data-id="${inc.id}" title="Supprimer">×</button>
    `;
    div.querySelector('.btn-delete-exp').addEventListener('click', async () => {
      if (!confirm('Supprimer ce revenu ?')) return;
      await sb.from('incomes').delete().eq('id', inc.id);
      showToast('Revenu supprimé');
      renderIncomesList();
    });
    list.appendChild(div);
  });
}

// ── FIXED CHARGES ────────────────────────────────────────────
document.getElementById('btn-add-fixed').addEventListener('click', () => {
  document.getElementById('modal-fixed').classList.remove('hidden');
  populateCategorySelects();
});
document.getElementById('btn-cancel-fixed').addEventListener('click', () => {
  document.getElementById('modal-fixed').classList.add('hidden');
});

document.getElementById('btn-save-fixed').addEventListener('click', async () => {
  const name = document.getElementById('fix-name').value.trim();
  const amount = parseFloat(document.getElementById('fix-amount').value);
  const cat_id = document.getElementById('fix-category').value;
  const day = parseInt(document.getElementById('fix-day').value) || 1;

  if (!name) return showToast('Nom requis', 'error');
  if (!amount || amount <= 0) return showToast('Montant invalide', 'error');

  const { error } = await sb.from('fixed_charges').insert({
    user_id: currentUser.id,
    name, amount, category_id: cat_id || null,
    day_of_month: day
  });
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }

  document.getElementById('modal-fixed').classList.add('hidden');
  document.getElementById('fix-name').value = '';
  document.getElementById('fix-amount').value = '';
  document.getElementById('fix-day').value = '';
  showToast('Charge fixe ajoutée ✓');
  renderFixedCharges();
});

async function renderFixedCharges() {
  const { data } = await sb.from('fixed_charges')
    .select('*').eq('user_id', currentUser.id).order('day_of_month');
  const list = document.getElementById('fixed-charges-list');
  list.innerHTML = '';
  if (!data?.length) {
    list.innerHTML = '<p class="empty-state"><span class="empty-icon">🏠</span>Aucune charge fixe enregistrée</p>';
    return;
  }
  data.forEach(fc => {
    const cat = getCatById(fc.category_id);
    const div = document.createElement('div');
    div.className = 'expense-item';
    div.innerHTML = `
      <div class="expense-cat-dot" style="background:${cat?.color || '#666'}"></div>
      <div class="expense-info">
        <div class="expense-desc">${fc.name}</div>
        <div class="expense-meta">
          ${cat?.name || 'Sans catégorie'} · Chaque mois le ${fc.day_of_month}
          <span class="tag-fixed">FIXE</span>
        </div>
      </div>
      <div class="expense-amount">${fmt(fc.amount)}</div>
      <button class="btn-delete-exp" data-id="${fc.id}" title="Supprimer">×</button>
    `;
    div.querySelector('.btn-delete-exp').addEventListener('click', async () => {
      if (!confirm('Supprimer cette charge fixe ?')) return;
      await sb.from('fixed_charges').delete().eq('id', fc.id);
      showToast('Charge supprimée');
      renderFixedCharges();
    });
    list.appendChild(div);
  });
}

// ── CATEGORIES ───────────────────────────────────────────────
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
  const budget = parseFloat(document.getElementById('cat-budget').value) || 0;

  if (!name) return showToast('Nom requis', 'error');

  if (editingCategoryId) {
    await sb.from('categories').update({ name, budget_limit: budget, color: selectedColor })
      .eq('id', editingCategoryId);
    showToast('Catégorie mise à jour ✓');
  } else {
    await sb.from('categories').insert({
      user_id: currentUser.id,
      name, budget_limit: budget, color: selectedColor
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
    card.style.setProperty('--cat-color', cat.color || '#666');
    card.style.cssText += `border-left: 3px solid ${cat.color || '#666'}`;
    card.innerHTML = `
      <div class="cat-card-header">
        <div class="cat-card-name">
          <span class="cat-dot" style="background:${cat.color}"></span>
          ${cat.name}
        </div>
        <button class="btn-delete-cat" data-id="${cat.id}">✕</button>
      </div>
      <div class="cat-budget-label">Budget mensuel</div>
      <div class="cat-budget-amount">${cat.budget_limit != null ? fmt(cat.budget_limit) : '—'}</div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-cat')) return;
      editingCategoryId = cat.id;
      document.getElementById('modal-cat-title').textContent = 'Modifier la catégorie';
      document.getElementById('cat-name').value = cat.name;
      document.getElementById('cat-budget').value = cat.budget_limit != null ? cat.budget_limit : '';
      selectedColor = cat.color || COLORS[0];
      buildColorPicker();
      document.getElementById('modal-category').classList.remove('hidden');
    });
    card.querySelector('.btn-delete-cat').addEventListener('click', async () => {
      if (!confirm(`Supprimer la catégorie "${cat.name}" ?`)) return;
      await sb.from('categories').delete().eq('id', cat.id);
      await loadCategories();
      renderCategories();
      populateCategorySelects();
      showToast('Catégorie supprimée');
    });
    grid.appendChild(card);
  });
}

// ── HISTORY ──────────────────────────────────────────────────
async function renderHistory() {
  const histEl = document.getElementById('history-list');
  histEl.innerHTML = '<p class="empty-state"><span class="empty-icon">⏳</span>Chargement...</p>';

  // Fetch all expenses
  const { data } = await sb.from('expenses')
    .select('*').eq('user_id', currentUser.id).order('date');
  const { dataIncome } = await sb.from('incomes')
    .select('*').eq('user_id', currentUser.id).order('date');
  if (!data?.length) {
    histEl.innerHTML = '<p class="empty-state"><span class="empty-icon">📅</span>Aucun historique disponible</p>';
    return;
  }

  // Group by month
  const byMonth = {};
  data.forEach(e => {
    const key = e.date.slice(0, 7); // YYYY-MM
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(e);
  });

  const byMonthIncome = {};
  dataIncome.forEach(e => {
    const key = e.date.slice(0, 7); // YYYY-MM
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(e);
  });

  histEl.innerHTML = '';
  const keys = Object.keys(byMonth).sort().reverse();
  keys.forEach(key => {
    const [y, m] = key.split('-');
    const exps = byMonth[key];
    const total = exps.reduce((a, e) => a + e.amount, 0);
    const fixed = exps.filter(e => e.is_fixed).reduce((a, e) => a + e.amount, 0);
    const variable = total - fixed;
    const income = byMonthIncome[key] || 0;
    const saving = income - total;
    const label = `${MONTHS_FR[parseInt(m) - 1]} ${y}`;

    const card = document.createElement('div');
    card.className = 'history-month-card';
    card.innerHTML = `
      <div class="history-card-header">
        <div class="history-card-month">${label}</div>
        <div class="history-card-total">${fmt(total)}</div>
      </div>
      <div class="history-card-body">
        <div class="history-stat">
          <div class="history-stat-label">Charges fixes</div>
          <div class="history-stat-val">${fmt(fixed)}</div>
        </div>
        <div class="history-stat">
          <div class="history-stat-label">Variables</div>
          <div class="history-stat-val">${fmt(variable)}</div>
        </div>
        <div class="history-stat">
          <div class="history-stat-label">Saving</div>
          <div class="history-stat-val">${fmt(saving)}</div>
        </div>
        <div class="history-stat">
          <div class="history-stat-label">Nb. dépenses</div>
          <div class="history-stat-val">${exps.length}</div>
        </div>
      </div>
    `;
    card.querySelector('.history-card-header').addEventListener('click', () => {
      card.classList.toggle('open');
    });
    histEl.appendChild(card);
  });
}

// ── UTILS ─────────────────────────────────────────────────────
function fmt(n) {
  res = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
  return res != null ? res : 0;
}

function populateCategorySelects() {
  ['exp-category', 'fix-category'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="">Sélectionner...</option>';
    categories.forEach(c => {
      sel.innerHTML += `<option value="${c.id}" ${c.id === val ? 'selected' : ''}>${c.name}</option>`;
    });
  });
}
