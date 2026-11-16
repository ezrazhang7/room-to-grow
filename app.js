// Room to Grow. Plain static site: three JSON files in data/, d3 for drawing, no backend.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmtInt = d3.format(',');
  const bad = (v) => v == null || Number.isNaN(+v);
  const num = (v) => (bad(v) ? '—' : fmtInt(Math.round(+v)));
  const one = (v) => (bad(v) ? '—' : d3.format(',.1f')(+v));
  const pct = (v) => (bad(v) ? '—' : d3.format(',.1f')(+v) + '%');
  const pct0 = (v) => (bad(v) ? '—' : Math.round(+v) + '%');
  const usd = (v) => (bad(v) ? '—' : '$' + fmtInt(Math.round(+v)));
  const signed = (v) => (bad(v) ? '—' : (v > 0 ? '+' : '') + d3.format('.1f')(v) + '%');
  const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '-');
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const KIND = { rural: 'Rural', regional: 'Regional city or suburban', urban: 'Urban' };
  const KIND_COLOR = { rural: 'var(--accent)', regional: 'var(--accent-2)', urban: 'var(--accent-3)' };
  const SETTING = { rural: 'rural', regional: 'suburban', urban: 'urban' };
  const BARRIER = {
    infrastructure: 'Water, sewer and roads', 'financing-gap': 'Projects that do not pencil out', 'land-and-zoning': 'Land and zoning',
    'local-capacity': 'Local staff and know-how', 'aging-stock': 'Aging homes', 'cost-burden': 'Costs against incomes',
    displacement: 'Displacement', 'construction-workforce': 'Construction workforce',
  };
  // Cut-offs for the seven checks. Chosen for this site; each is printed on its check.
  const LIMITS = { pace: 50, homeValue: 200000, yearBuilt: 1980, mobile: 20, rentBurden: 50, growth: 5, smallHouseholds: 25000 };
  const METRIC = {
    gap_pct_hh: { label: 'Homes short per 100 households', f: one },
    total_gap: { label: 'Homes short by 2029', f: num },
    pace_pct: { label: 'Permits as a share of yearly need', f: pct0 },
    hh_growth_pct: { label: 'Household growth, 2024 to 2029', f: pct },
    rent_burden_pct: { label: 'Renters paying 30% or more of income', f: pct },
    median_home_value: { label: 'Median home value', f: usd },
    distressed_units: { label: 'Distressed water and sewer systems', f: num },
  };
  const RAMP = ['--r1', '--r2', '--r3', '--r4', '--r5'];

  const S = { counties: [], strategies: [], cases: [], county: null, metric: 'gap_pct_hh', barrier: 'auto', setting: 'auto', showAll: { strategies: false, cases: false } };
  const FIRST = 4;
  const row = () => S.counties.find((r) => r.fips === S.county) || null;
  const sum = (rows, k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);

  // ---------- derived ----------
  function stateTotals() {
    const gap = sum(S.counties, 'total_gap'), hh = sum(S.counties, 'hh_2024');
    return { total_gap: gap, rental_gap: sum(S.counties, 'rental_gap'), forsale_gap: sum(S.counties, 'forsale_gap'),
      gap_pct_hh: (gap / hh) * 100, pace_pct: (sum(S.counties, 'permits_avg') / (gap / 5)) * 100,
      hh_growth_pct: (sum(S.counties, 'hh_2029') / hh - 1) * 100 };
  }
  function byClass() {
    const allGap = sum(S.counties, 'total_gap'), allHh = sum(S.counties, 'hh_2024');
    return ['rural', 'regional', 'urban'].map((cls) => {
      const rows = S.counties.filter((r) => r.rural_class === cls);
      const gap = sum(rows, 'total_gap'), hh = sum(rows, 'hh_2024');
      return { cls, label: KIND[cls], n: rows.length, gap, share: (gap / allGap) * 100, hhShare: (hh / allHh) * 100,
        per100: (gap / hh) * 100, pace: (sum(rows, 'permits_avg') / (gap / 5)) * 100,
        slow: rows.filter((r) => r.pace_pct != null && r.pace_pct < 50).length };
    });
  }
  function peersOf(me) {
    return S.counties.filter((r) => r.rural_class === me.rural_class && r.fips !== me.fips)
      .map((r) => ({ r, d: Math.abs(Math.log(r.hh_2024) - Math.log(me.hh_2024)) }))
      .sort((a, b) => a.d - b.d).slice(0, 5).map((x) => x.r);
  }
  function flagsOf(c) {
    const L = LIMITS;
    return [
      { barriers: ['infrastructure'], label: 'Water and sewer under strain', on: c.distressed_units > 0,
        why: num(c.distressed_units) + ' distressed water or sewer systems. Flag: 1 or more.' },
      { barriers: ['land-and-zoning', 'construction-workforce'], label: 'Building well below need', on: c.pace_pct != null && c.pace_pct < L.pace,
        why: 'Permits cover ' + pct0(c.pace_pct) + ' of the yearly need. Flag: under ' + L.pace + '%.' },
      { barriers: ['financing-gap'], label: 'New homes may cost more than they sell for', on: c.median_home_value < L.homeValue,
        why: 'Median home value ' + usd(c.median_home_value) + '. Flag: under ' + usd(L.homeValue) + '.' },
      { barriers: ['aging-stock'], label: 'Older and manufactured homes', on: c.median_year_built <= L.yearBuilt || c.mobile_pct >= L.mobile,
        why: 'Median home built ' + c.median_year_built + '; ' + pct(c.mobile_pct) + ' mobile homes. Flag: ' + L.yearBuilt + ' or earlier, or ' + L.mobile + '% or more.' },
      { barriers: ['cost-burden'], label: 'Renters stretched', on: c.rent_burden_pct >= L.rentBurden,
        why: pct(c.rent_burden_pct) + ' of renters pay 30% or more of income. Flag: ' + L.rentBurden + '% or more.' },
      { barriers: ['displacement'], label: 'Growth pressure on renters', on: c.rural_class !== 'rural' && c.hh_growth_pct >= L.growth,
        why: 'Households ' + signed(c.hh_growth_pct) + ' by 2029. Flag: non-rural county growing ' + L.growth + '% or more.' },
      { barriers: ['local-capacity'], label: 'Thin local capacity', on: c.tier === 1 && c.hh_2024 < L.smallHouseholds,
        why: 'Tier ' + c.tier + ', ' + num(c.hh_2024) + ' households. Flag: tier 1 with under ' + num(L.smallHouseholds) + '.' },
    ];
  }
  const median = (rows, k) => d3.median(rows, (r) => r[k]);

  // ---------- map ----------
  function scale(key) {
    const vals = S.counties.map((r) => r[key]).filter((v) => v != null).sort(d3.ascending);
    const fixed = key === 'distressed_units';
    const cuts = fixed ? [1, 2, 3, 5] : [0.2, 0.4, 0.6, 0.8].map((q) => d3.quantileSorted(vals, q));
    const bin = (v) => (v == null ? -1 : fixed ? d3.bisectRight(cuts, v) : d3.bisectLeft(cuts, v));
    return { cuts, bin, min: vals[0], max: vals[vals.length - 1], fixed };
  }
  function drawLegend() {
    const m = METRIC[S.metric], sc = scale(S.metric), edges = [sc.min, ...sc.cuts, sc.max];
    $('map-legend').replaceChildren(...RAMP.map((v, i) => {
      const span = el('span'), sw = el('i'); sw.style.background = 'var(' + v + ')';
      const lo = sc.fixed ? (i === 0 ? 0 : sc.cuts[i - 1]) : edges[i];
      const hi = sc.fixed ? (i === 4 ? sc.max : sc.cuts[i] - 1) : edges[i + 1];
      span.append(sw, lo === hi ? m.f(lo) : m.f(lo) + ' to ' + m.f(hi));
      return span;
    }));
  }
  function drawMap() {
    const box = $('map'), geo = window.RG_GEO, m = METRIC[S.metric], sc = scale(S.metric);
    const by = new Map(S.counties.map((r) => [r.fips, r]));
    box.replaceChildren();
    const svg = d3.select(box).append('svg').attr('viewBox', '0 0 ' + geo.w + ' ' + geo.h).attr('role', 'img')
      .attr('aria-label', 'Map of North Carolina counties shaded by ' + m.label.toLowerCase() + '. Use the county search for a keyboard route.');
    const tip = el('div', 'tip'); tip.hidden = true; box.append(tip);
    const order = geo.counties.slice().sort((a, b) => (a.fips === S.county) - (b.fips === S.county));
    svg.selectAll('path').data(order).join('path')
      .attr('d', (d) => d.d).attr('class', (d) => (d.fips === S.county ? 'on' : null))
      .style('fill', (d) => { const b = sc.bin(by.get(d.fips)?.[S.metric]); return b < 0 ? 'var(--r0)' : 'var(' + RAMP[b] + ')'; })
      .on('click', (e, d) => select(d.fips))
      .on('pointermove', (e, d) => {
        const r = by.get(d.fips); if (!r) return;
        tip.replaceChildren(el('strong', null, r.county + ' County'), el('div', null, m.label + ': ' + m.f(r[S.metric])), el('div', null, KIND[r.rural_class] + ' · ' + num(r.total_gap) + ' homes short'));
        tip.hidden = false;
        const b = box.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(e.clientX - b.left + 12, b.width - tip.offsetWidth - 4)) + 'px';
        tip.style.top = Math.max(0, e.clientY - b.top - tip.offsetHeight - 10) + 'px';
      })
      .on('pointerleave', () => { tip.hidden = true; });
  }

  // ---------- statewide panel ----------
  function drawState() {
    const t = stateTotals(), groups = byClass();
    $('st-total').textContent = num(t.total_gap);
    $('st-rental').textContent = num(t.rental_gap);
    $('st-forsale').textContent = num(t.forsale_gap);
    const box = $('donut'); box.replaceChildren();
    const R = 100, svg = d3.select(box).append('svg').attr('viewBox', [-R, -R, 2 * R, 2 * R].join(' ')).attr('role', 'img')
      .attr('aria-label', 'Share of the statewide housing gap: ' + groups.map((g) => g.label + ' ' + pct0(g.share)).join(', '));
    const arcs = d3.pie().sort(null).value((g) => g.gap).padAngle(0.012)(groups);
    const arc = d3.arc().innerRadius(60).outerRadius(R).cornerRadius(2);
    svg.selectAll('path').data(arcs).join('path').attr('d', arc).style('fill', (d) => KIND_COLOR[d.data.cls]);
    svg.append('text').attr('text-anchor', 'middle').attr('y', -2).style('font-size', '13px').style('font-weight', 600).text('Share of');
    svg.append('text').attr('text-anchor', 'middle').attr('y', 15).style('font-size', '13px').style('font-weight', 600).text('the gap');
    $('donut-key').replaceChildren(...groups.map((g) => {
      const li = el('li'), sw = el('i'); sw.style.background = KIND_COLOR[g.cls];
      li.append(sw, el('span', null, g.label), el('b', null, pct0(g.share)), el('small', null, num(g.gap) + ' homes · ' + g.n + ' counties'));
      return li;
    }));
    const ul = el('ul', 'cf');
    groups.forEach((g) => {
      const li = el('li');
      li.append(el('b', null, g.label), el('span', null,
        one(g.per100) + ' homes short per 100 households · ' + pct0(g.hhShare) + ' of state households · permits cover ' + pct0(g.pace) + ' of yearly need · ' + g.slow + ' of ' + g.n + ' counties permit under half the need'));
      ul.append(li);
    });
    $('class-facts').replaceChildren(ul);
  }

  // ---------- county panel ----------
  function drawCounty() {
    const c = row();
    $('panel-state').hidden = !!c; $('panel-county').hidden = !c; $('profile-sec').hidden = !c;
    if (!c) return;
    const peers = peersOf(c), st = stateTotals(), flags = flagsOf(c);
    $('c-kind').textContent = KIND[c.rural_class] + ' county';
    $('c-name').textContent = c.county; $('p-name').textContent = c.county;
    const chips = [];
    if (c.tier != null) chips.push('Commerce tier ' + c.tier);
    if (c.cog) chips.push(c.cog.replace(/\s*\(Region.*\)$/, ''));
    if (c.osoh_team) chips.push('Our State, Our Homes team');
    if (c.homes_damaged != null || c.homes_destroyed != null) chips.push('Helene disaster county');
    $('c-chips').replaceChildren(...chips.map((t) => el('span', 'chip', t)));
    const stats = [
      ['Homes short by 2029', num(c.total_gap), num(c.rental_gap) + ' rent · ' + num(c.forsale_gap) + ' buy'],
      ['Short per 100 households', one(c.gap_pct_hh), 'State ' + one(st.gap_pct_hh) + ' · Peers ' + one(median(peers, 'gap_pct_hh')) + ' · Rank #' + c.gap_rank],
      ['Household growth to 2029', signed(c.hh_growth_pct), 'State ' + signed(st.hh_growth_pct) + ' · Peers ' + signed(median(peers, 'hh_growth_pct'))],
      ['Permits vs. yearly need', pct0(c.pace_pct), num(c.permits_avg) + ' of ' + num(c.annual_need) + ' a year · Peers ' + pct0(median(peers, 'pace_pct'))],
    ];
    $('c-stats').replaceChildren(...stats.map(([l, n, s]) => { const d = el('div'); d.append(el('div', 'stat-label', l), el('div', 'stat-num', n), el('div', 'stat-cmp', s)); return d; }));
    $('c-pills').replaceChildren(...flags.filter((f) => f.on).map((f) => el('span', 'pill', f.label)));
    drawBands(c); drawPermits(c); drawFacts(c); drawPeers(c, peers); drawFlags(flags);
  }

  const BANDS = [['30', '30% of AMI or less'], ['50', '31 to 50%'], ['80', '51 to 80%'], ['120', '81 to 120%'], ['150', '121 to 150%'], ['151', '151% or more']];
  function drawBands(c) {
    const box = $('bands'), data = BANDS.map(([k, label]) => ({ label, rent: c['rg_' + k], sale: c['fg_' + k] }));
    const top = (k) => data.slice().sort((a, b) => (b[k] || 0) - (a[k] || 0))[0].label.replace(' of AMI', '');
    $('bands-title').textContent = 'Rental need is largest at ' + top('rent') + ' of AMI; for-sale need at ' + top('sale');
    const W = Math.max(box.clientWidth, 260), rowH = 36, left = 118, right = 50, H = rowH * data.length + 8;
    const x = d3.scaleLinear().domain([0, d3.max(data, (d) => Math.max(d.rent || 0, d.sale || 0)) || 1]).range([0, W - left - right]);
    box.replaceChildren();
    const svg = d3.select(box).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H).attr('role', 'img')
      .attr('aria-label', 'Homes short in ' + c.county + ' County by income band, rental and for sale');
    const g = svg.selectAll('g').data(data).join('g').attr('transform', (d, i) => 'translate(0,' + (4 + i * rowH) + ')');
    g.append('text').attr('x', left - 8).attr('y', rowH / 2 - 1).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text((d) => d.label);
    [['rent', 'var(--accent)', 3], ['sale', 'var(--accent-2)', 17]].forEach(([k, color, y]) => {
      g.append('rect').attr('x', left).attr('y', y).attr('height', 12).attr('rx', 2).attr('width', (d) => x(d[k] || 0)).style('fill', color);
      g.append('text').attr('class', 'val').attr('x', (d) => left + x(d[k] || 0) + 5).attr('y', y + 6.5).attr('dominant-baseline', 'middle').text((d) => num(d[k]));
    });
  }
  function drawPermits(c) {
    const box = $('permits'), years = ['2021', '2022', '2023', '2024', '2025'], data = years.map((y) => ({ y, v: c['permits_' + y] })), need = c.annual_need;
    $('permits-title').textContent = 'Recent permits cover ' + pct0(c.pace_pct) + ' of the ' + num(need) + ' homes a year the gap calls for';
    const W = Math.max(box.clientWidth, 260), H = 232, m = { t: 22, r: 10, b: 24, l: 46 };
    const x = d3.scaleBand().domain(years).range([m.l, W - m.r]).padding(0.3);
    const y = d3.scaleLinear().domain([0, (Math.max(need || 0, d3.max(data, (d) => d.v) || 0) || 1) * 1.14]).nice().range([H - m.b, m.t]);
    box.replaceChildren();
    const svg = d3.select(box).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H).attr('role', 'img')
      .attr('aria-label', 'Housing units permitted in ' + c.county + ' County, 2021 to 2025, against a yearly need of ' + num(need));
    const ticks = y.ticks(4);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).style('stroke', 'var(--line)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').text((d) => fmtInt(d));
    svg.append('g').selectAll('rect').data(data).join('rect').attr('x', (d) => x(d.y)).attr('width', x.bandwidth()).attr('y', (d) => y(d.v || 0)).attr('height', (d) => y(0) - y(d.v || 0)).attr('rx', 2)
      .style('fill', 'var(--accent)').style('opacity', (d) => (+d.y >= 2023 ? 1 : 0.45));
    svg.append('g').selectAll('text').data(data).join('text').attr('class', 'val').attr('x', (d) => x(d.y) + x.bandwidth() / 2).attr('y', (d) => y(d.v || 0) - 5).attr('text-anchor', 'middle').text((d) => num(d.v));
    svg.append('g').selectAll('text').data(data).join('text').attr('x', (d) => x(d.y) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => d.y);
    if (need != null) {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(need)).attr('y2', y(need)).style('stroke', 'var(--ink)').style('stroke-dasharray', '5 4').style('stroke-width', 1.4);
      svg.append('text').attr('class', 'val').attr('x', W - m.r).attr('y', y(need) - 6).attr('text-anchor', 'end').text('Yearly need ' + num(need));
    }
  }
  const FACTS = [
    ['median_income', 'Median household income', usd], ['median_rent', 'Median rent', usd], ['fair_market_rent_2br', 'Two-bedroom fair market rent', usd],
    ['housing_wage_hourly', 'Hourly wage needed for that rent', (v) => (bad(v) ? '—' : '$' + d3.format('.2f')(v))],
    ['median_home_value', 'Median home value', usd], ['median_list_price', 'Median list price', usd],
    ['renter_share_pct', 'Households that rent', pct], ['rent_burden_pct', 'Renters paying 30% or more of income', pct],
    ['eviction_filings', 'Eviction filings in a year', num], ['mf_vacancy_pct', 'Vacancy, surveyed apartments', pct],
    ['forsale_avail_pct', 'Homes for sale, share of owner homes', pct], ['mobile_pct', 'Mobile homes, share of all homes', pct],
    ['median_year_built', 'Median year homes were built', (v) => (bad(v) ? '—' : String(v))],
    ['distressed_names', 'Distressed water or sewer systems', (v) => (v ? v.split('; ').join(', ') : 'None listed')],
  ];
  function drawFacts(c) {
    $('facts').replaceChildren(...FACTS.map(([k, label, f]) => { const d = el('div', 'fact'); d.append(el('dt', null, label), el('dd', null, f(c[k]))); return d; }));
  }
  function drawPeers(c, peers) {
    const rows = [c, ...peers.slice().sort((a, b) => b.hh_2024 - a.hh_2024)];
    $('peers').tBodies[0].replaceChildren(...rows.map((r) => {
      const tr = el('tr', r.fips === c.fips ? 'self' : null);
      [r.county, num(r.hh_2024), num(r.total_gap), one(r.gap_pct_hh), signed(r.hh_growth_pct), pct0(r.pace_pct), usd(r.median_home_value), pct(r.rent_burden_pct)].forEach((v) => tr.append(el('td', null, v)));
      tr.onclick = () => select(r.fips);
      return tr;
    }));
  }
  function flagItem(f) { const li = el('li', 'flag' + (f.on ? '' : ' off')); li.append(el('em', null, f.on ? 'Flagged' : 'Not flagged'), el('b', null, f.label), el('span', null, f.why)); return li; }
  function drawFlags(flags) {
    const on = flags.filter((f) => f.on);
    $('flags').replaceChildren(...(on.length ? on.map(flagItem) : [el('li', 'empty', 'None of the seven checks is flagged for this county.')]));
    $('flags-all').replaceChildren(...flags.map(flagItem));
  }

  // ---------- approaches ----------
  const safe = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
  function link(url, label) { const u = safe(url); if (!u) return document.createTextNode(''); const a = el('a', null, label); a.href = u; a.target = '_blank'; a.rel = 'noopener'; return a; }
  function fold(summary, ...paras) { const d = el('details'); d.append(el('summary', null, summary), ...paras); return d; }
  function labelled(label, text) { const p = el('p'); p.append(el('b', null, label + ' '), text || 'Not stated'); return p; }
  function drawApproaches() {
    const c = row();
    $('approaches-title').textContent = c ? 'What places like ' + c.county + ' County are doing' : 'What North Carolina places are doing';
    $('barrier-select').options[0].hidden = !c; $('setting-select').options[0].hidden = !c;
    let barrier = S.barrier, setting = S.setting;
    if (!c && barrier === 'auto') barrier = 'all';
    if (!c && setting === 'auto') setting = 'any';
    $('barrier-select').value = barrier; $('setting-select').value = setting;
    let barriers = barrier === 'all' ? Object.keys(BARRIER) : barrier === 'auto' ? [...new Set(flagsOf(c).filter((f) => f.on).flatMap((f) => f.barriers))] : [barrier];
    const place = setting === 'any' ? null : setting === 'auto' ? SETTING[c.rural_class] : setting;
    const rank = (x) => barriers.indexOf(x.barrier);
    const st = S.strategies.filter((x) => barriers.includes(x.barrier) && (!place || String(x.applies_to || '').split(',').includes(place))).sort((a, b) => rank(a) - rank(b));
    const cs = S.cases.filter((x) => barriers.includes(x.barrier) && (!place || x.setting === place))
      .sort((a, b) => (c ? (b.county === c.county) - (a.county === c.county) : 0) || rank(a) - rank(b));
    const none = () => [el('p', 'empty', 'Nothing in the library matches. Try "All" or "Any".')];
    const capped = (id, cards) => {
      if (S.showAll[id] || cards.length <= FIRST) return cards;
      const btn = el('button', 'ghost show-all', 'Show all ' + cards.length); btn.type = 'button';
      btn.onclick = () => { S.showAll[id] = true; drawApproaches(); };
      return [...cards.slice(0, FIRST), btn];
    };
    $('strategies').replaceChildren(...(st.length ? capped('strategies', st.map((x) => {
      const card = el('article', 'card item');
      const eg = el('p', 'eg');
      eg.append(el('b', null, [x.example_place, x.example_county && x.example_county !== 'Statewide' ? x.example_county + ' County' : x.example_county].filter(Boolean).join(', ') + ': '), (x.example_summary || '') + ' ', link(x.source_url, 'Source'));
      card.append(el('span', 'kind', BARRIER[x.barrier] || x.barrier), el('h4', null, x.name), el('p', null, x.what_it_is || ''), eg, fold('First step', el('p', null, x.how_to_start || '')));
      return card;
    })) : none()));
    $('cases').replaceChildren(...(cs.length ? capped('cases', cs.map((x) => {
      const card = el('article', 'card item');
      const bits = []; if (x.units != null) bits.push(num(x.units) + ' homes'); if (x.total_cost != null) bits.push(usd(x.total_cost)); if (x.year) bits.push(String(x.year));
      const eg = el('p', 'eg'); eg.append((x.lesson || '') + ' ', link(x.source_url, x.source_name || 'Source'));
      card.append(el('span', 'kind', [x.place, x.county ? x.county + ' County' : null].filter(Boolean).join(', ')), el('h4', null, x.title));
      if (bits.length) card.append(el('p', 'meta', bits.join(' · ')));
      card.append(eg, fold('What happened and who paid', el('p', null, x.what_happened || ''), labelled('Who paid:', x.who_paid), labelled('Timeline:', x.timeline)));
      return card;
    })) : none()));
  }

  // ---------- state changes ----------
  function render() { drawLegend(); drawMap(); drawCounty(); drawApproaches(); }
  function select(fips, fromHash) {
    S.county = fips || null; S.barrier = 'auto'; S.setting = 'auto'; S.showAll = { strategies: false, cases: false };
    const c = row();
    $('county-search').value = c ? c.county : '';
    if (!fromHash) { try { history.replaceState(null, '', c ? '#' + slug(c.county) : location.pathname + location.search); } catch (e) { /* hash not available here */ } }
    document.title = c ? c.county + ' County · Room to Grow' : 'Room to Grow';
    render();
  }
  function fromHash() {
    const h = (location.hash || '').replace(/^#/, '');
    const c = S.counties.find((r) => slug(r.county) === h);
    select(c ? c.fips : null, true);
  }

  $('metric-select').onchange = (e) => { S.metric = e.target.value; drawLegend(); drawMap(); };
  $('barrier-select').onchange = (e) => { S.barrier = e.target.value; S.showAll = { strategies: false, cases: false }; drawApproaches(); };
  $('setting-select').onchange = (e) => { S.setting = e.target.value; drawApproaches(); };
  $('to-state').onclick = () => select(null);
  $('to-profile').onclick = () => $('profile-sec').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  $('panel-toggle').onclick = (e) => {
    const collapsed = $('explore').classList.toggle('collapsed');
    e.currentTarget.textContent = collapsed ? 'Show panel' : 'Hide panel';
    e.currentTarget.setAttribute('aria-expanded', String(!collapsed));
  };
  const search = $('county-search');
  const trySearch = () => {
    const q = search.value.trim().toLowerCase().replace(/ county$/, '');
    const c = S.counties.find((r) => r.county.toLowerCase() === q);
    if (c && c.fips !== S.county) select(c.fips);
  };
  search.addEventListener('input', trySearch); search.addEventListener('change', trySearch);
  addEventListener('hashchange', fromHash);
  let wide = innerWidth;
  addEventListener('resize', () => { if (Math.abs(innerWidth - wide) > 20) { wide = innerWidth; if (row()) { drawBands(row()); drawPermits(row()); } } });

  Promise.all(['counties', 'strategies', 'cases'].map((n) => fetch('data/' + n + '.json').then((r) => { if (!r.ok) throw new Error(n); return r.json(); })))
    .then(([c, s, k]) => {
      S.counties = c.rows.map((r) => ({ ...r, fips: String(r.fips) })); S.strategies = s.rows; S.cases = k.rows;
      $('county-list').replaceChildren(...S.counties.map((r) => { const o = el('option'); o.value = r.county; return o; }));
      drawState(); fromHash();
    })
    .catch(() => { $('map').replaceChildren(el('p', 'empty', 'The data files did not load. Reload the page, or check that the data folder was uploaded with the site.')); });
})();
