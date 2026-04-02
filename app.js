const API = 'https://api.ergoplatform.com/api/v1';
const EXPLORER = 'https://explorer.ergoplatform.com/en/transactions';
const ERG = 1e9;
const PAGE_SIZE = 20;

let allTxs = [];
let shownCount = 0;
let currentAddress = '';
let chart = null;
let currentRange = 'all';

// ── Stars ────────────────────────────────────────────────────────────────────
(function spawnStars() {
  const container = document.getElementById('stars');
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2 + 1;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      --d:${(Math.random() * 3 + 2).toFixed(1)}s;
    `;
    container.appendChild(s);
  }
})();

// ── UI helpers ───────────────────────────────────────────────────────────────
function show(id)  { document.getElementById(id).classList.remove('hidden'); }
function hide(id)  { document.getElementById(id).classList.add('hidden'); }
function set(id, v){ document.getElementById(id).textContent = v; }

function setLoading(msg) {
  hide('results');
  hide('errorMsg');
  document.getElementById('loadingMsg').textContent = msg;
  show('loadingSection');
}

function showError(msg) {
  hide('loadingSection');
  hide('results');
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function fmtErg(nanoErg) {
  const e = nanoErg / ERG;
  return e.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' ERG';
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchAllTransactions(address) {
  const txs = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    setLoading(`Fetching transactions… (${txs.length} so far)`);
    const data = await fetchJSON(
      `${API}/addresses/${address}/transactions?offset=${offset}&limit=${limit}&concise=false`
    );
    const items = data.items || [];
    txs.push(...items);
    if (txs.length >= data.total || items.length < limit) break;
    offset += limit;
    if (txs.length >= 500) break; // cap for very active wallets
  }
  return txs;
}

// ── Compute wallet flow from a single transaction ────────────────────────────
function classifyTx(tx, address) {
  let received = 0n;
  let spent = 0n;

  for (const out of tx.outputs || []) {
    if (out.address === address) received += BigInt(out.value || 0);
  }
  for (const inp of tx.inputs || []) {
    if (inp.address === address) spent += BigInt(inp.value || 0);
  }

  const net = received - spent;
  return {
    id: tx.id,
    timestamp: tx.timestamp,
    received: Number(received),
    spent: Number(spent),
    net: Number(net),
    type: net > 0 ? 'in' : net < 0 ? 'out' : 'mixed',
  };
}

// ── Build running balance series ─────────────────────────────────────────────
function buildBalanceSeries(classified) {
  // Sort oldest first
  const sorted = [...classified].sort((a, b) => a.timestamp - b.timestamp);
  let balance = 0;
  return sorted.map(tx => {
    balance += tx.net / ERG;
    return { x: tx.timestamp, y: +balance.toFixed(4), ...tx };
  });
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function renderChart(series, range) {
  const now = Date.now();
  let filtered = series;

  if (range !== 'all') {
    const cutoff = now - parseInt(range) * 86400000;
    filtered = series.filter(p => p.x >= cutoff);
  }

  const labels = filtered.map(p => new Date(p.x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const data   = filtered.map(p => p.y);

  if (chart) { chart.destroy(); chart = null; }

  const ctx = document.getElementById('balanceChart').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, 'rgba(240,106,0,0.35)');
  grad.addColorStop(1, 'rgba(240,106,0,0.02)');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'ERG Balance',
        data,
        borderColor: '#f06a00',
        backgroundColor: grad,
        borderWidth: 2,
        pointRadius: filtered.length > 60 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: '#ff9640',
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#12162a',
          borderColor: '#1e2540',
          borderWidth: 1,
          titleColor: '#e8eaf0',
          bodyColor: '#6b7280',
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toLocaleString('en-US', { maximumFractionDigits: 4 })} ERG`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#6b7280', maxTicksLimit: 8, maxRotation: 0 },
          grid: { color: 'rgba(30,37,64,0.6)' },
        },
        y: {
          ticks: {
            color: '#6b7280',
            callback: v => v.toLocaleString('en-US', { maximumFractionDigits: 2 }),
          },
          grid: { color: 'rgba(30,37,64,0.6)' },
        },
      },
    },
  });
}

// ── Timeline rendering ────────────────────────────────────────────────────────
function renderTimelineItems(classified, balanceSeries, startIdx, count) {
  const container = document.getElementById('timeline');
  // Show newest first
  const sorted = [...classified].sort((a, b) => b.timestamp - a.timestamp);
  const slice  = sorted.slice(startIdx, startIdx + count);

  // Build a balance map keyed by tx id (from series which is oldest-first with running balance)
  const balMap = {};
  for (const p of balanceSeries) balMap[p.id] = p.y;

  slice.forEach((tx, i) => {
    const item = document.createElement('div');
    item.className = 'tx-item';
    item.style.animationDelay = `${i * 0.04}s`;

    const sign   = tx.net > 0 ? '+' : tx.net < 0 ? '' : '±';
    const cls    = tx.type;
    const netErg = (tx.net / ERG).toFixed(4);
    const bal    = balMap[tx.id] != null
      ? balMap[tx.id].toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' ERG'
      : '—';

    item.innerHTML = `
      <div class="tx-dot ${cls}"></div>
      <div class="tx-info">
        <div class="tx-id">
          <a href="${EXPLORER}/${tx.id}" target="_blank" rel="noopener">
            ${tx.id.slice(0, 12)}…${tx.id.slice(-8)}
          </a>
        </div>
        <div class="tx-date">${fmtDate(tx.timestamp)}</div>
      </div>
      <div>
        <div class="tx-amount ${cls}">${sign}${netErg} ERG</div>
        <div class="tx-balance">bal: ${bal}</div>
      </div>
    `;
    container.appendChild(item);
  });

  shownCount = startIdx + slice.length;
  const loadBtn = document.getElementById('loadMoreBtn');
  if (shownCount < classified.length) {
    loadBtn.classList.remove('hidden');
  } else {
    loadBtn.classList.add('hidden');
  }
}

// ── Main analyze ──────────────────────────────────────────────────────────────
async function analyze() {
  const addr = document.getElementById('addressInput').value.trim();
  if (!addr) { showError('Please enter an Ergo wallet address.'); return; }
  if (!addr.startsWith('9') || addr.length < 40) {
    showError('Invalid Ergo address. Addresses start with "9" and are 51 characters long.');
    return;
  }

  currentAddress = addr;
  currentRange = 'all';
  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-range="all"]').classList.add('active');

  try {
    // Fetch balance
    setLoading('Fetching wallet balance…');
    const balData = await fetchJSON(`${API}/addresses/${addr}/balance/confirmed`);
    const balNano = balData.nanoErgs || 0;

    // Fetch transactions
    const rawTxs = await fetchAllTransactions(addr);
    setLoading('Processing transactions…');

    // Classify each tx
    const classified = rawTxs.map(tx => classifyTx(tx, addr));
    allTxs = classified;

    // Stats
    const totalReceived = classified.filter(t => t.net > 0).reduce((s, t) => s + t.net, 0);
    const totalSent     = classified.filter(t => t.net < 0).reduce((s, t) => s + Math.abs(t.net), 0);
    const oldest        = classified.reduce((min, t) => t.timestamp < min ? t.timestamp : min, Date.now());

    set('statBalance',  fmtErg(balNano));
    set('statReceived', '+' + fmtErg(totalReceived));
    set('statSent',     '-' + fmtErg(totalSent));
    set('statTxCount',  classified.length.toLocaleString());
    set('statSince',    classified.length
      ? new Date(oldest).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—');

    // Chart
    const series = buildBalanceSeries(classified);

    // Show results
    hide('loadingSection');
    hide('errorMsg');
    document.getElementById('timeline').innerHTML = '';
    document.getElementById('loadMoreBtn').classList.add('hidden');
    show('results');

    renderChart(series, currentRange);
    shownCount = 0;
    renderTimelineItems(classified, series, 0, PAGE_SIZE);

    // Store series for range switching
    document.getElementById('balanceChart')._series = series;

  } catch (err) {
    console.error(err);
    showError('Failed to load data. Check the address or try again. (' + err.message + ')');
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('analyzeBtn').addEventListener('click', analyze);

document.getElementById('addressInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') analyze();
});

document.getElementById('loadMoreBtn').addEventListener('click', () => {
  const canvas = document.getElementById('balanceChart');
  const series = canvas._series || [];
  renderTimelineItems(allTxs, series, shownCount, PAGE_SIZE);
});

document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    const canvas = document.getElementById('balanceChart');
    const series = canvas._series || [];
    renderChart(series, currentRange);
  });
});
