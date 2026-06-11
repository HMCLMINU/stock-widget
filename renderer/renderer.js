'use strict';

const POLL_MS = 15000; // 15초 폴링

const state = {
  items: [], // { symbol, name, shortName, currency, logo, target }
  settings: {},
  quotes: {}, // symbol -> quote
};

const els = {
  list: document.getElementById('list'),
  search: document.getElementById('searchInput'),
  results: document.getElementById('searchResults'),
  status: document.getElementById('status'),
  updated: document.getElementById('updated'),
  template: document.getElementById('cardTemplate'),
};

// ---- 유틸 ----

function fmtPrice(value, currency) {
  if (value == null || Number.isNaN(value)) return '—';
  const krw = currency === 'KRW';
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: krw ? 0 : 2,
    maximumFractionDigits: krw ? 0 : 2,
  }).format(value);
}

function currencySymbol(currency) {
  if (currency === 'KRW') return '₩';
  if (currency === 'USD') return '$';
  if (currency === 'JPY') return '¥';
  if (currency === 'EUR') return '€';
  return '';
}

function parseNumber(text) {
  if (text == null) return null;
  const n = parseFloat(String(text).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function dirClass(v) {
  if (v == null || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

// 심볼 기반 결정적 색상 (로고 폴백 아바타용)
function avatarColor(symbol) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 45%), hsl(${(h + 40) % 360} 60% 38%))`;
}

function initials(item) {
  const base = (item.shortName || item.name || item.symbol).trim();
  // 한글이면 첫 글자, 영문이면 앞 2글자
  if (/[가-힣]/.test(base)) return base[0];
  return base.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || base[0];
}

// ---- 영속화 ----

async function persist() {
  await window.api.save({ items: state.items, settings: state.settings });
}

// ---- 렌더 ----

function render() {
  els.list.innerHTML = '';

  if (state.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML =
      '<div class="big">📈</div><div>위에서 기업을 검색해<br />관심 종목을 추가하세요.</div>';
    els.list.appendChild(empty);
    return;
  }

  for (const item of state.items) {
    els.list.appendChild(buildCard(item));
  }
}

function buildCard(item) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const q = state.quotes[item.symbol];

  // 로고
  const img = node.querySelector('.logo-img');
  const fallback = node.querySelector('.logo-fallback');
  const box = node.querySelector('.logo-box');
  fallback.textContent = initials(item);
  box.style.background = avatarColor(item.symbol);
  if (item.logo) {
    img.src = item.logo;
    img.classList.remove('hidden');
    img.onerror = () => img.classList.add('hidden');
  } else {
    img.classList.add('hidden');
  }

  // 이름 / 티커
  node.querySelector('.name').textContent = item.shortName || item.name;
  node.querySelector('.name').title = item.name;
  node.querySelector('.ticker').textContent = item.symbol;

  // 가격
  const currency = q ? q.currency : item.currency;
  const sym = currencySymbol(currency);
  node.querySelector('.price').textContent = q
    ? sym + fmtPrice(q.price, currency)
    : '…';

  // 등락
  const changeEl = node.querySelector('.change');
  if (q && q.changePct != null) {
    const cls = dirClass(q.change);
    const arrow = q.change > 0 ? '▲' : q.change < 0 ? '▼' : '–';
    changeEl.className = 'change ' + cls;
    changeEl.textContent = `${arrow} ${fmtPrice(Math.abs(q.change), currency)} (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%)`;
  } else {
    changeEl.className = 'change flat';
    changeEl.textContent = '–';
  }

  // 목표가
  const targetInput = node.querySelector('.target-input');
  const targetGap = node.querySelector('.target-gap');
  if (item.target != null) targetInput.value = fmtPrice(item.target, currency);
  updateTargetGap(targetGap, item, q, currency);

  targetInput.addEventListener('focus', () => {
    targetInput.value = item.target != null ? String(item.target) : '';
  });
  targetInput.addEventListener('blur', async () => {
    const v = parseNumber(targetInput.value);
    item.target = v;
    targetInput.value = v != null ? fmtPrice(v, currency) : '';
    updateTargetGap(targetGap, item, state.quotes[item.symbol], currency);
    await persist();
  });
  targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') targetInput.blur();
  });

  // 삭제
  node.querySelector('.remove-btn').addEventListener('click', async () => {
    state.items = state.items.filter((x) => x.symbol !== item.symbol);
    delete state.quotes[item.symbol];
    await persist();
    render();
  });

  return node;
}

function updateTargetGap(el, item, q, currency) {
  if (item.target == null || !q || q.price == null) {
    el.textContent = '';
    el.className = 'target-gap';
    return;
  }
  const diffPct = ((item.target - q.price) / q.price) * 100;
  // 목표가가 현재가보다 높으면 상승 여력 → up 색, 낮으면 down
  el.className = 'target-gap ' + dirClass(diffPct);
  el.textContent = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%`;
}

// ---- 시세 폴링 ----

async function refreshQuotes() {
  if (state.items.length === 0) {
    els.status.textContent = '관심 종목 없음';
    return;
  }
  els.status.textContent = '갱신 중…';
  await Promise.all(
    state.items.map(async (item) => {
      try {
        const q = await window.api.quote(item.symbol);
        state.quotes[item.symbol] = q;
        if (!item.currency && q.currency) item.currency = q.currency;
      } catch (e) {
        /* 개별 실패는 무시, 다음 폴링에서 재시도 */
      }
    })
  );
  render();
  const now = new Date();
  els.status.textContent = `${state.items.length}개 종목`;
  els.updated.textContent =
    '업데이트 ' +
    now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---- 검색 ----

let searchTimer = null;
let searchSeq = 0;

els.search.addEventListener('input', () => {
  const q = els.search.value.trim();
  clearTimeout(searchTimer);
  if (!q) {
    hideResults();
    return;
  }
  searchTimer = setTimeout(() => doSearch(q), 280);
});

els.search.addEventListener('blur', () => {
  // 결과 클릭이 먼저 처리되도록 약간 지연
  setTimeout(hideResults, 150);
});

async function doSearch(query) {
  const seq = ++searchSeq;
  let results = [];
  try {
    results = await window.api.search(query);
  } catch (e) {
    results = [];
  }
  if (seq !== searchSeq) return; // 더 최신 검색이 있으면 폐기
  showResults(results);
}

function showResults(results) {
  els.results.innerHTML = '';
  els.results.classList.remove('hidden');

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'result-empty';
    empty.textContent = '검색 결과가 없습니다';
    els.results.appendChild(empty);
    return;
  }

  for (const r of results) {
    const already = state.items.some((x) => x.symbol === r.symbol);
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <span class="result-name">${escapeHtml(r.name)}${already ? ' ✓' : ''}</span>
      <span class="result-meta">${escapeHtml(r.symbol)} · ${escapeHtml(r.exchange)} · ${escapeHtml(r.type)}</span>`;
    if (!already) {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        addStock(r);
      });
    } else {
      item.style.opacity = '0.5';
    }
    els.results.appendChild(item);
  }
}

function hideResults() {
  els.results.classList.add('hidden');
  els.results.innerHTML = '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

async function addStock(r) {
  if (state.items.some((x) => x.symbol === r.symbol)) return;
  const item = {
    symbol: r.symbol,
    name: r.name,
    shortName: r.shortName,
    currency: null,
    logo: null,
    target: null,
  };
  state.items.push(item);
  els.search.value = '';
  hideResults();
  render();
  await persist();

  // 시세 + 로고는 비동기로 채운다
  window.api.quote(r.symbol).then((q) => {
    state.quotes[r.symbol] = q;
    if (q.currency) item.currency = q.currency;
    render();
    persist();
  }).catch(() => {});

  window.api.logo(r.symbol).then((url) => {
    if (url) {
      item.logo = url;
      render();
      persist();
    }
  }).catch(() => {});
}

// ---- 창 제어 ----

document.getElementById('closeBtn').addEventListener('click', () => window.api.win('close'));
document.getElementById('minBtn').addEventListener('click', () => window.api.win('minimize'));
document.getElementById('pinBtn').addEventListener('click', async () => {
  const pinned = await window.api.win('pin');
  document.getElementById('pinBtn').classList.toggle('active', !!pinned);
});

// ---- 초기화 ----

async function boot() {
  const data = await window.api.load();
  state.items = data.items || [];
  state.settings = data.settings || {};
  document.getElementById('pinBtn').classList.add('active'); // 기본 alwaysOnTop
  render();
  await refreshQuotes();

  // 저장된 종목에 로고가 없으면 채우기
  for (const item of state.items) {
    if (!item.logo) {
      window.api.logo(item.symbol).then((url) => {
        if (url) {
          item.logo = url;
          render();
          persist();
        }
      }).catch(() => {});
    }
  }

  setInterval(refreshQuotes, POLL_MS);
}

boot();
