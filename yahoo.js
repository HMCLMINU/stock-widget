'use strict';

// Yahoo Finance 비공식 엔드포인트 래퍼.
// 미국/한국 종목 모두 지원. API 키 불필요. 메인 프로세스에서만 호출(CORS 없음).

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let cookie = null;
let crumb = null;

// 일부 보호된 엔드포인트(quoteSummary)는 쿠키 + crumb 인증이 필요하다.
async function ensureCrumb() {
  if (crumb && cookie) return;
  const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const setCookie = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const cr = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  });
  crumb = (await cr.text()).trim();
  if (!crumb || crumb.includes('<')) {
    crumb = null;
    throw new Error('crumb 획득 실패');
  }
}

async function getJson(url, withAuth = false) {
  const headers = { 'User-Agent': UA };
  if (withAuth) {
    await ensureCrumb();
    headers.Cookie = cookie;
  }
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

// 종목 검색 — 회사명/티커로 미국·한국 통합 검색.
async function search(query) {
  const url =
    'https://query1.finance.yahoo.com/v1/finance/search?q=' +
    encodeURIComponent(query) +
    '&quotesCount=10&newsCount=0';
  const data = await getJson(url);
  const quotes = (data.quotes || []).filter(
    (q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
  );
  return quotes.map((q) => ({
    symbol: q.symbol,
    name: q.longname || q.shortname || q.symbol,
    shortName: q.shortname || q.longname || q.symbol,
    exchange: q.exchDisp || q.exchange || '',
    type: q.quoteType,
  }));
}

// 단일 종목 시세 — chart 엔드포인트는 crumb 없이 동작하며 안정적.
async function quote(symbol) {
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=1d&range=1d';
  const data = await getJson(url);
  const result = data.chart && data.chart.result && data.chart.result[0];
  if (!result || !result.meta) throw new Error(`시세 없음: ${symbol}`);
  const m = result.meta;
  const price = m.regularMarketPrice;
  const prevClose = m.previousClose ?? m.chartPreviousClose;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
  return {
    symbol: m.symbol,
    currency: m.currency,
    price,
    prevClose,
    change,
    changePct,
    dayHigh: m.regularMarketDayHigh,
    dayLow: m.regularMarketDayLow,
    week52High: m.fiftyTwoWeekHigh,
    week52Low: m.fiftyTwoWeekLow,
    marketTime: m.regularMarketTime ? m.regularMarketTime * 1000 : null,
    exchange: m.fullExchangeName || m.exchangeName || '',
  };
}

// 회사 웹사이트 도메인 → favicon 로고 URL (실패 시 null, 렌더러가 아바타로 폴백).
async function logo(symbol) {
  try {
    await ensureCrumb();
    const url =
      'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' +
      encodeURIComponent(symbol) +
      '?modules=assetProfile&crumb=' +
      encodeURIComponent(crumb);
    const data = await getJson(url, true);
    const profile =
      data.quoteSummary &&
      data.quoteSummary.result &&
      data.quoteSummary.result[0] &&
      data.quoteSummary.result[0].assetProfile;
    const website = profile && profile.website;
    if (!website) return null;
    const domain = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!domain) return null;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch (e) {
    return null;
  }
}

module.exports = { search, quote, logo };
