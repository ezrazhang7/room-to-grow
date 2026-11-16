#!/usr/bin/env python3
"""Merge the county sources into the three files the Room to Grow dashboard reads.

Inputs (data/):
  gap_A..D.json   Bowen National Research, 2024 Housing Supply Gap Analysis (NC Chamber Foundation), county tables
  acs.csv         Census ACS 2020-2024 5-year, via Census Reporter API
  permits.txt     Census Building Permits Survey, annual county files 2021-2025 (units: 1-unit / 2-4 / 5+)
  nchc_1/2.json   NC Housing Coalition 2026 county profiles
  classes.json    NC Rural Center class, NC Commerce tier, council of government, Our State Our Homes team
  infra.json      NC DEQ Viable Utility Reserve distressed water/sewer units
Derived columns:
  annual_need    = total_gap / 5                      (the gap covers 2024-2029)
  permits_avg    = mean of 2023, 2024, 2025 permitted units
  pace_pct       = permits_avg / annual_need * 100
  rent_burden_pct= renters paying 30%+ of income / renters with burden computed (ACS B25070)
  mobile_pct     = mobile homes / housing units (ACS B25024)
  renter_share_pct = renter households / occupied units (ACS B25003)
  gap_rank       = rank of gap_pct_hh among the 100 counties, 1 = largest gap relative to households
"""
import csv, json, os, sys, datetime

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)


def load(name):
    p = os.path.join(D, name)
    if not os.path.exists(p):
        print('MISSING', name)
        return None
    return json.load(open(p))


def first(d, *keys):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def bands(obj):
    """Return the six AMI bands in order, whatever the key spelling."""
    if obj is None:
        return [None] * 6
    if 'by_ami' in obj:
        obj = obj['by_ami']
    vals = []
    for v in obj.values():
        if isinstance(v, dict):
            v = first(v, 'units', 'gap', 'value')
        vals.append(v)
    return (vals + [None] * 6)[:6]


rows = {}
for r in csv.DictReader(open(os.path.join(D, 'acs.csv'))):
    g = lambda k: float(r[k]) if r[k] not in ('', 'None', 'null') else None
    burd_den = g('B25070001') - g('B25070011')
    rows[r['name']] = {
        'fips': r['fips'], 'county': r['name'],
        'population': int(g('B01003001')), 'housing_units': int(g('B25001001')),
        'median_rent': int(g('B25064001')), 'median_home_value': int(g('B25077001')),
        'median_income': int(g('B19013001')),
        'renter_share_pct': round(g('B25003003') / g('B25003001') * 100, 1),
        'rent_burden_pct': round((g('B25070007') + g('B25070008') + g('B25070009') + g('B25070010')) / burd_den * 100, 1),
        'mobile_pct': round(g('B25024010') / g('B25024001') * 100, 1),
        'median_year_built': int(g('B25035001')),
    }
byfips = {v['fips']: v for v in rows.values()}

for line in open(os.path.join(D, 'permits.txt')):
    p = line.strip().split(',')
    if len(p) < 6:
        continue
    row = byfips[p[0]]
    tot = []
    for i, y in enumerate(['2021', '2022', '2023', '2024', '2025']):
        sf, mid, mf = [int(x) for x in p[i + 1].split('/')]
        row['permits_' + y] = sf + mid + mf
        tot.append((sf, mid, mf))
    last3 = tot[2:]
    row['permits_avg'] = round(sum(sum(t) for t in last3) / 3, 1)
    units3 = sum(sum(t) for t in last3)
    row['permits_mf_share_pct'] = round(sum(t[2] for t in last3) / units3 * 100, 1) if units3 else None

for f in 'ABCD':
    for name, v in load('gap_%s.json' % f)['counties'].items():
        row = rows[name]
        row.update({
            'total_gap': v['total_gap'], 'rental_gap': v['rental_gap'], 'forsale_gap': v['forsale_gap'],
            'hh_2024': v['households_2024'], 'hh_2029': v['households_2029'], 'hh_growth_pct': v['hh_growth_pct'],
            'gap_pct_hh': first(v, 'gap_to_total_hh_ratio_pct', 'total_gap_to_total_hh_pct', 'gap_to_total_households_pct'),
            'rental_gap_pct_renters': first(v, 'gap_to_renter_hh_ratio_pct', 'rental_gap_to_renter_hh_pct', 'gap_to_renter_households_pct'),
            'forsale_gap_pct_owners': first(v, 'gap_to_owner_hh_ratio_pct', 'forsale_gap_to_owner_hh_pct', 'gap_to_owner_households_pct'),
            'mf_vacancy_pct': v.get('multifamily_vacancy_pct'), 'forsale_avail_pct': v.get('forsale_availability_pct'),
            'median_list_price': v.get('median_list_price'),
        })
        if row['hh_growth_pct'] is None:
            row['hh_growth_pct'] = round((v['households_2029'] - v['households_2024']) / v['households_2024'] * 100, 1)
        for pre, key in (('rg', 'rental_gap_by_ami'), ('fg', 'forsale_gap_by_price')):
            b = bands(v.get(key))
            for lab, val in zip(['30', '50', '80', '120', '150', '151'], b):
                row['%s_%s' % (pre, lab)] = val
            tot = v['rental_gap'] if pre == 'rg' else v['forsale_gap']
            if None not in b and sum(b) != tot:
                print('BAND SUM MISMATCH', name, pre, sum(b), tot)
        row['annual_need'] = round(v['total_gap'] / 5, 1)
        row['pace_pct'] = round(row['permits_avg'] / row['annual_need'] * 100, 1) if row['annual_need'] else None

nchc_fields = ['cost_burdened_pct', 'renters_cost_burdened_pct', 'owners_cost_burdened_pct', 'fair_market_rent_2br',
               'housing_wage_hourly', 'income_needed_annual', 'eviction_filings', 'county_rank_evictions', 'foreclosures',
               'salary_construction', 'homes_damaged', 'homes_destroyed']
for f in ('nchc_1.json', 'nchc_2.json'):
    d = load(f)
    if not d:
        continue
    for name, v in d['counties'].items():
        if name in rows:
            for k in nchc_fields:
                rows[name][k] = v.get(k)

cl = load('classes.json')
if cl:
    for name, v in cl['counties'].items():
        if name in rows:
            rows[name].update({'tier': v.get('tier'), 'tier_rank': v.get('tier_rank'),
                               'cog': v.get('cog'), 'osoh_team': bool(v.get('osoh_team'))})
# NC Rural Center rule on 2020 Census density: rural <= 250 people per square mile, regional city and
# suburban 250-750, urban > 750. Computed from the 2020 Census base population (co-est2023-alldata.csv) and
# land area (2020 Gazetteer); the result is the Rural Center's published 78 / 16 / 6 split.
URBAN = ['Durham', 'Forsyth', 'Guilford', 'Mecklenburg', 'New Hanover', 'Wake']
REGIONAL = ['Alamance', 'Buncombe', 'Cabarrus', 'Catawba', 'Cumberland', 'Davidson', 'Gaston', 'Henderson', 'Iredell',
            'Johnston', 'Lincoln', 'Onslow', 'Orange', 'Pitt', 'Rowan', 'Union']
for name, r in rows.items():
    r['rural_class'] = 'urban' if name in URBAN else 'regional' if name in REGIONAL else 'rural'
assert sum(1 for r in rows.values() if r['rural_class'] == 'rural') == 78
inf = load('infra.json')
if inf:
    for name, v in inf['counties'].items():
        if name in rows:
            units = v.get('distressed_units') or []
            rows[name]['distressed_units'] = v.get('distressed_unit_count', len(units))
            rows[name]['distressed_names'] = '; '.join(units)
            rows[name]['sewer_moratoria'] = '; '.join(v.get('sewer_moratoria') or [])
            rows[name]['septic_share_pct'] = v.get('septic_share_pct')

_rk = sorted(rows.values(), key=lambda r: -r['gap_pct_hh'])
for i, r in enumerate(_rk):
    r['gap_rank'] = 1 + sum(1 for o in _rk if o['gap_pct_hh'] > r['gap_pct_hh'])
cols = ['fips', 'county', 'rural_class', 'tier', 'tier_rank', 'cog', 'osoh_team',
        'total_gap', 'rental_gap', 'forsale_gap', 'gap_pct_hh', 'gap_rank', 'rental_gap_pct_renters', 'forsale_gap_pct_owners',
        'hh_2024', 'hh_2029', 'hh_growth_pct', 'annual_need', 'permits_avg', 'pace_pct', 'permits_mf_share_pct',
        'permits_2021', 'permits_2022', 'permits_2023', 'permits_2024', 'permits_2025',
        'rg_30', 'rg_50', 'rg_80', 'rg_120', 'rg_150', 'rg_151', 'fg_30', 'fg_50', 'fg_80', 'fg_120', 'fg_150', 'fg_151',
        'mf_vacancy_pct', 'forsale_avail_pct', 'median_list_price',
        'population', 'housing_units', 'median_income', 'median_rent', 'median_home_value', 'renter_share_pct',
        'rent_burden_pct', 'mobile_pct', 'median_year_built'] + nchc_fields + \
       ['distressed_units', 'distressed_names', 'sewer_moratoria', 'septic_share_pct']
out_rows = [{c: r.get(c) for c in cols} for r in sorted(rows.values(), key=lambda r: r['county'])]
assert len(out_rows) == 100
tg = sum(r['total_gap'] for r in out_rows)
print('rows', len(out_rows), 'total gap', tg, 'rental', sum(r['rental_gap'] for r in out_rows), 'forsale', sum(r['forsale_gap'] for r in out_rows))
for c in cols:
    n = sum(1 for r in out_rows if r[c] is None)
    if n:
        print('  nulls', c, n)

code = open(os.path.abspath(__file__)).read()
meta = [
    {'label': 'build.py', 'value': code, 'type': 'code', 'lang': 'python'},
    {'label': 'Housing gap, households, vacancy, list price', 'value': 'Bowen National Research for NC Chamber Foundation, NC Home Builders Association and NC REALTORS, 2024 Housing Supply Gap Analysis, State of North Carolina (2024-2029 projection). County sums equal the statewide 764,478 / 322,360 rental / 442,118 for-sale.'},
    {'label': 'Rent, home value, income, rent burden, mobile homes, year built', 'value': 'U.S. Census Bureau, American Community Survey 2020-2024 5-year estimates, tables B01003, B19013, B25001, B25003, B25024, B25035, B25064, B25070, B25077, retrieved through the Census Reporter API.'},
    {'label': 'Permits', 'value': 'U.S. Census Bureau Building Permits Survey, annual county files 2021-2025 (www2.census.gov/econ/bps/County). Units in permit-issuing places only; a county with no reporting permit office shows 0.'},
    {'label': 'Cost burden, housing wage, evictions', 'value': 'North Carolina Housing Coalition, 2026 County Profiles.'},
    {'label': 'County classes', 'value': 'NC Rural Center county classification; NC Department of Commerce development tiers; NC regional councils of government; Carolina Across 100 Our State, Our Homes teams.'},
    {'label': 'Distressed water and sewer systems', 'value': 'NC Department of Environmental Quality, Division of Water Infrastructure, Viable Utility Reserve list of distressed local government units.'},
]
json.dump({'rows': out_rows, 'meta': meta}, open(os.path.join(OUT, 'counties.json'), 'w'), separators=(',', ':'))

st = load('strategies.json')
if st:
    srows = []
    for s in st['strategies']:
        ex = s.get('nc_example') or {}
        srows.append({'id': s['id'], 'name': s['name'], 'barrier': s['barrier'], 'applies_to': ','.join(s.get('applies_to') or []),
                      'what_it_is': s.get('what_it_is'), 'how_to_start': s.get('how_a_local_government_starts'),
                      'example_place': ex.get('place'), 'example_county': ex.get('county'), 'example_summary': ex.get('summary'),
                      'source_url': ex.get('source_url')})
    json.dump({'rows': srows, 'meta': [{'label': 'How this was made', 'value': 'Strategy library compiled for this dashboard from Carolina Across 100, UNC School of Government, Golden LEAF, NC Housing Finance Agency, NC DEQ and local government sources. Each example links to the page it was taken from.'}]},
              open(os.path.join(OUT, 'strategies.json'), 'w'), separators=(',', ':'))
    print('strategies', len(srows))
cs = load('cases.json')
if cs:
    crows = []
    for c in cs['cases']:
        crows.append({k: c.get(k) for k in ['id', 'title', 'place', 'county', 'setting', 'barrier', 'year', 'what_happened', 'units',
                                            'total_cost', 'who_paid', 'timeline', 'lesson', 'source_url', 'source_name']})
    json.dump({'rows': crows, 'meta': [{'label': 'How this was made', 'value': 'North Carolina housing projects and programs, 2021-2026, compiled for this dashboard. Every figure is from the linked source; blank means the source did not state it.'}]},
              open(os.path.join(OUT, 'cases.json'), 'w'), separators=(',', ':'))
    print('cases', len(crows))
for f in os.listdir(OUT):
    print(f, os.path.getsize(os.path.join(OUT, f)))
