/* 서울 아파트 리뷰 지도 — 정적 앱 (빌드 없음) */
(() => {
  'use strict';

  const STORAGE_KEY = 'seoul-apt-review.v2';
  const REPO = 'seongpilo/seoul-apt-review';
  const STATUSES = ['전체', '후보', '임장예정', '보류', '탈락'];
  const STATUS_COLOR = { '후보': '#2f6df6', '임장예정': '#f59e0b', '보류': '#8b95a1', '탈락': '#e5484d' };
  const CHECK_LABELS = { parking: '주차', condition: '신축·컨디션', daylight: '채광', infra: '주변 인프라' };
  const CHECK_STATE = { 'null': ['미확인', ''], 'true': ['좋음', '✓'], 'false': ['아쉬움', '!'] };

  const REGIONS = {
    '도심권': ['종로구', '중구', '용산구'],
    '동북권': ['성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구'],
    '서북권': ['은평구', '서대문구', '마포구'],
    '서남권': ['양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구'],
    '동남권': ['서초구', '강남구', '송파구', '강동구']
  };
  const REGION_COLOR = { '도심권': '#7c5cff', '동북권': '#0ea5a4', '서북권': '#f59e0b', '서남권': '#3b82f6', '동남권': '#10b981' };
  const DISTRICT_TO_REGION = {};
  Object.entries(REGIONS).forEach(([r, list]) => list.forEach(d => { DISTRICT_TO_REGION[d] = r; }));

  const STATIONS = [
    { name: '역삼역', lines: '2호선', lat: 37.50082, lng: 127.03696 },
    { name: '강남역', lines: '2호선·신분당', lat: 37.49804, lng: 127.02798 },
    { name: '선릉역', lines: '2호선·수인분당', lat: 37.50447, lng: 127.04895 },
    { name: '삼성역', lines: '2호선', lat: 37.50884, lng: 127.06314 },
    { name: '한티역', lines: '수인분당', lat: 37.49627, lng: 127.05287 },
    { name: '도곡역', lines: '3호선', lat: 37.49063, lng: 127.05547 },
    { name: '교대역', lines: '2·3호선', lat: 37.49387, lng: 127.01438 },
    { name: '신논현역', lines: '9호선·신분당', lat: 37.50455, lng: 127.02473 },
    { name: '서울숲역', lines: '수인분당', lat: 37.54359, lng: 127.04474 },
    { name: '뚝섬역', lines: '2호선', lat: 37.54724, lng: 127.04741 },
    { name: '성수역', lines: '2호선', lat: 37.54457, lng: 127.0561 },
    { name: '왕십리역', lines: '2·5호선·경의중앙·수인분당', lat: 37.56121, lng: 127.03715 },
    { name: '한양대역', lines: '2호선', lat: 37.55573, lng: 127.04366 },
    { name: '공덕역', lines: '5·6호선·경의중앙·공항철도', lat: 37.5439, lng: 126.95101 },
    { name: '여의도역', lines: '5·9호선', lat: 37.52167, lng: 126.9243 },
    { name: '문래역', lines: '2호선', lat: 37.51838, lng: 126.89487 },
    { name: '신도림역', lines: '1·2호선', lat: 37.50894, lng: 126.89123 },
    { name: '영등포구청역', lines: '2·5호선', lat: 37.52402, lng: 126.89634 },
    { name: '홍대입구역', lines: '2호선·경의중앙·공항철도', lat: 37.55663, lng: 126.92345 },
    { name: '시청역', lines: '1·2호선', lat: 37.56548, lng: 126.97711 },
    { name: '광화문역', lines: '5호선', lat: 37.57162, lng: 126.9769 },
    { name: '잠실역', lines: '2·8호선', lat: 37.51322, lng: 127.10014 },
    { name: '건대입구역', lines: '2·7호선', lat: 37.50926, lng: 127.07186 }
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    meta: null,
    baseA: { name: '역삼 기준점', lat: 37.5007, lng: 127.0365 },
    apartments: [],
    geo: null,
    status: '전체',
    district: '전체',
    q: '',
    maxDeposit: 13,
    maxRent: 420,
    sort: 'distance',
    selected: null,
    edit: false,
    baseB: null,
    picking: null,
    layers: { districts: true, regions: false, radius: true },
    dirty: false,
    calc: { equity: 2, rate: 4.5, jeonse: 11, deposit: 5, rent: 260 }
  };

  let map, districtLayer, ringGroup, pinGroup, baseBLayer, lineLayer, baseALayer;
  const labels = [];
  const pins = new Map();
  let toastTimer = null;

  /* ---------------- boot ---------------- */
  boot();

  async function boot() {
    try {
      const [aptData, geo] = await Promise.all([
        fetchJson('data/apartments.json'),
        fetchJson('data/seoul_districts.geojson')
      ]);
      state.meta = aptData.meta || {};
      if (aptData.meta && aptData.meta.baseA) {
        state.baseA = { name: aptData.meta.baseA.name || '역삼 기준점', lat: aptData.meta.baseA.lat, lng: aptData.meta.baseA.lng };
      }
      state.apartments = aptData.apartments || [];
      state.geo = geo;

      const saved = loadLocal();
      if (saved && Array.isArray(saved.apartments)) {
        state.apartments = saved.apartments;
        state.dirty = !!saved.dirty;
        if (saved.baseB) state.baseB = saved.baseB;
        toast('이 브라우저에 저장된 편집본을 불러왔습니다');
      }
      buildStaticUI();
      initMap();
      renderChips();
      renderList();
      syncDirty();
    } catch (err) {
      document.body.insertAdjacentHTML('afterbegin',
        `<div style="padding:16px;font-size:13px;background:#fff3f3;color:#b3232b;border-bottom:1px solid #f4c7c7;font-family:inherit">
          데이터를 불러오지 못했습니다: ${escapeHtml(String(err.message || err))}
        </div>`);
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url} (HTTP ${res.status})`);
    return res.json();
  }

  /* ---------------- static UI ---------------- */
  function buildStaticUI() {
    const districtSel = $('#f-district');
    const names = Object.keys(DISTRICT_TO_REGION).sort((a, b) => a.localeCompare(b, 'ko'));
    names.forEach(n => districtSel.insertAdjacentHTML('beforeend', `<option value="${n}">${n}</option>`));
    $('#new-district').innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');

    $('#b-select').insertAdjacentHTML('beforeend',
      STATIONS.map((s, i) => `<option value="${i}">${s.name} (${s.lines})</option>`).join(''));

    // events
    $('#btn-edit').addEventListener('click', () => setEdit(!state.edit));
    $('#btn-export').addEventListener('click', openExport);
    $('#btn-import').addEventListener('click', openImport);
    $('#btn-add').addEventListener('click', openNew);
    $('#f-q').addEventListener('input', e => { state.q = e.target.value.trim(); renderList(); });
    $('#f-district').addEventListener('change', e => { state.district = e.target.value; restyleDistricts(); renderList(); });
    $('#f-sort').addEventListener('change', e => { state.sort = e.target.value; renderList(); });
    $('#f-deposit-val').textContent = '제한 없음';
    $('#f-rent-val').textContent = '제한 없음';
    $('#f-deposit').addEventListener('input', e => {
      state.maxDeposit = Number(e.target.value);
      $('#f-deposit-val').textContent = state.maxDeposit >= 13 ? '제한 없음' : `${state.maxDeposit}억`;
      renderList();
    });
    $('#f-rent').addEventListener('input', e => {
      state.maxRent = Number(e.target.value);
      $('#f-rent-val').textContent = state.maxRent >= 420 ? '제한 없음' : `${state.maxRent}만`;
      renderList();
    });

    $('#t-districts').addEventListener('change', e => { state.layers.districts = e.target.checked; restyleDistricts(); });
    $('#t-regions').addEventListener('change', e => { state.layers.regions = e.target.checked; restyleDistricts(); renderLegend(); });
    $('#t-radius').addEventListener('change', e => { state.layers.radius = e.target.checked; drawRings(); });

    $('#b-select').addEventListener('change', e => {
      const idx = e.target.value;
      if (idx === '') return;
      const s = STATIONS[Number(idx)];
      setBaseB({ name: s.name, lines: s.lines, lat: s.lat, lng: s.lng, source: 'station' });
    });
    $('#b-pick').addEventListener('click', () => startPicking('B'));
    $('#b-clear').addEventListener('click', () => { state.baseB = null; saveLocal(); syncBaseB(); renderList(); });

    $('#ctrl-collapse').addEventListener('click', () => {
      $('#map-ctrl').classList.toggle('collapsed');
      $('#ctrl-collapse').textContent = $('#map-ctrl').classList.contains('collapsed') ? '+' : '–';
    });

    $('#sheet-backdrop').addEventListener('click', closeDetail);
    $$('[data-close]').forEach(b => b.addEventListener('click', () => hideModal(b.dataset.close)));
    $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) hideModal(m.id); }));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = $$('.modal').find(m => !m.hidden);
      if (open) return hideModal(open.id);
      if (!$('#detail').hidden) closeDetail();
    });

    $('#btn-copy').addEventListener('click', copyExport);
    $('#btn-download').addEventListener('click', downloadExport);
    $('#link-github-edit').href = `https://github.com/${REPO}/edit/main/data/apartments.json`;

    $('#import-file').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { $('#import-text').value = await f.text(); } catch (_) { toast('파일을 읽지 못했습니다'); }
    });
    $('#btn-apply-import').addEventListener('click', applyImport);
    $('#btn-reset').addEventListener('click', resetData);

    $('#new-pick').addEventListener('click', () => {
      hideModal('modal-new');
      startPicking('new');
    });
    $('#btn-create').addEventListener('click', createCandidate);

    $('#detail').addEventListener('click', onDetailClick);
    $('#detail').addEventListener('input', onDetailInput);
    $('#detail').addEventListener('change', onDetailInput);

    window.addEventListener('resize', () => { if (map) map.invalidateSize(); });
  }

  /* ---------------- map ---------------- */
  function initMap() {
    map = L.map('map', {
      zoomControl: false, minZoom: 10, maxZoom: 18,
      preferCanvas: true, zoomSnap: 0.5, wheelPxPerZoomLevel: 90
    }).setView([37.5326, 126.9908], 11);

    setupBaseLayer();

    map.createPane('districts').style.zIndex = 350;
    map.createPane('labels').style.zIndex = 360;

    districtLayer = L.geoJSON(state.geo, {
      pane: 'districts',
      style: districtStyle,
      onEachFeature: (feature, layer) => {
        const name = feature.properties.name;
        layer.on({
          mouseover: () => { if (state.district === '전체') layer.setStyle({ weight: 2, color: '#8fa6cc' }); },
          mouseout: () => restyleDistricts(),
          click: () => {
            state.district = state.district === name ? '전체' : name;
            $('#f-district').value = state.district;
            restyleDistricts(); renderList();
            const c = centroid(feature);
            map.flyTo(c, Math.max(map.getZoom(), 12), { duration: 0.6 });
          }
        });
      }
    }).addTo(map);

    // district labels
    state.geo.features.forEach(f => {
      const c = centroid(f);
      const marker = L.marker(c, {
        pane: 'labels', interactive: false, keyboard: false,
        icon: L.divIcon({
          className: 'district-label',
          html: `<span class="dlab-inner">${escapeHtml(f.properties.name)}</span>`,
          iconSize: [0, 0]
        })
      }).addTo(map);
      marker._districtName = f.properties.name;
      labels.push(marker);
    });

    ringGroup = L.layerGroup().addTo(map);
    pinGroup = L.layerGroup().addTo(map);

    baseALayer = L.marker([state.baseA.lat, state.baseA.lng], {
      zIndexOffset: 900, keyboard: false,
      icon: L.divIcon({
        className: 'pin-wrap',
        html: `<span class="base-pin"><span class="sq"></span><em>${escapeHtml(state.baseA.name)}</em></span>`,
        iconSize: [0, 0]
      })
    }).addTo(map).bindTooltip('직장 A 기준점 · 강남구 역삼동 일대', { direction: 'top', offset: [0, -10] });

    drawRings();
    syncBaseB();
    renderPins();

    map.on('zoomend', () => {
      const close = map.getZoom() >= 12.5;
      $('#map').classList.toggle('zoomed', close);
      labels.forEach(m => {
        const dim = state.district !== '전체' && m._districtName !== state.district;
        const el = m.getElement();
        if (el) el.classList.toggle('dim', dim);
      });
    });

    // map click used by pickers
    map.on('click', e => {
      if (!state.picking) return;
      const { lat, lng } = e.latlng;
      if (state.picking === 'B') {
        setBaseB({ name: '직장 B (지정 지점)', lines: '지도 지정', lat: round5(lat), lng: round5(lng), source: 'map' });
        state.picking = null;
        map.getContainer().style.cursor = '';
        toast('직장 B 위치를 지도에서 지정했습니다');
      } else if (state.picking === 'new') {
        $('#new-lat').value = round5(lat);
        $('#new-lng').value = round5(lng);
        state.picking = null;
        map.getContainer().style.cursor = '';
        showModal('modal-new');
        toast('좌표를 채웠습니다. 나머지 정보를 입력하세요');
      }
    });
  }

  function setupBaseLayer() {
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 16, maxZoom: 19,
      attribution: 'Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
    }).addTo(map);
    let errors = 0, swapped = false;
    esri.on('tileerror', () => {
      if (swapped) return;
      if (++errors >= 5) {
        swapped = true;
        map.removeLayer(esri);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        $('#map').classList.add('osm-fallback');
        $('#legend-note').textContent = '기본 타일을 OSM으로 전환했습니다 (Esri 타일 응답 없음)';
      }
    });
  }

  function districtStyle(feature) {
    const name = feature.properties.name;
    const isSel = state.district !== '전체' && state.district === name;
    const region = DISTRICT_TO_REGION[name];
    const on = state.layers.districts;
    const fill = state.layers.regions && region ? REGION_COLOR[region] : '#2f6df6';
    return {
      color: on ? (isSel ? '#2f6df6' : '#c7cfdd') : 'transparent',
      weight: isSel ? 2.2 : 1,
      opacity: on ? (isSel ? 0.95 : 0.85) : 0,
      fillColor: fill,
      fillOpacity: state.layers.regions ? (isSel ? 0.26 : 0.13) : (isSel ? 0.06 : 0),
      dashArray: null
    };
  }

  function restyleDistricts() {
    if (!districtLayer) return;
    districtLayer.setStyle(districtStyle);
    labels.forEach(m => {
      const dim = state.district !== '전체' && m._districtName !== state.district;
      const el = m.getElement();
      if (el) el.classList.toggle('dim', dim);
    });
  }

  function renderLegend() {
    const box = $('#map-legend');
    if (!state.layers.regions) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = Object.entries(REGIONS).map(([r, list]) =>
      `<span><i style="background:${REGION_COLOR[r]}"></i>${r} <small style="color:#98a1ae">${list.length}구</small></span>`
    ).join('');
  }

  function drawRings() {
    ringGroup.clearLayers();
    if (!state.layers.radius) return;
    [[1500, '도보·자전거권 1.5km'], [3000, '근거리 3km'], [6000, '대중교통권 6km']].forEach(([r]) => {
      L.circle([state.baseA.lat, state.baseA.lng], {
        radius: r, color: '#2f6df6', weight: 1, opacity: 0.35,
        dashArray: r === 1500 ? null : '4 7', fill: false, interactive: false
      }).addTo(ringGroup);
    });
  }

  function syncBaseB() {
    if (baseBLayer) { map.removeLayer(baseBLayer); baseBLayer = null; }
    if (lineLayer) { map.removeLayer(lineLayer); lineLayer = null; }
    const b = state.baseB;
    $('#b-state').textContent = b ? (b.source === 'station' ? b.name : '지정됨') : '미정';
    $('#b-clear').style.display = b ? '' : 'none';
    if (!b) { $('#b-select').value = ''; return; }
    baseBLayer = L.marker([b.lat, b.lng], {
      zIndexOffset: 880, keyboard: false,
      icon: L.divIcon({
        className: 'pin-wrap',
        html: `<span class="base-pin b"><span class="sq"></span><em>${escapeHtml(b.name)}</em></span>`,
        iconSize: [0, 0]
      })
    }).addTo(map).bindTooltip(`직장 B · ${escapeHtml(b.name)}${b.lines ? ' (' + escapeHtml(b.lines) + ')' : ''}`, { direction: 'top', offset: [0, -10] });
  }

  function drawLineToSelected() {
    if (lineLayer) { map.removeLayer(lineLayer); lineLayer = null; }
    if (!state.baseB || !state.selected) return;
    const apt = byId(state.selected);
    if (!apt) return;
    lineLayer = L.polyline([[state.baseB.lat, state.baseB.lng], [apt.lat, apt.lng]], {
      color: '#8b5cf6', weight: 1.6, opacity: 0.6, dashArray: '5 6', interactive: false
    }).addTo(map);
  }

  function renderPins() {
    pinGroup.clearLayers();
    pins.clear();
    visibleApartments().forEach(apt => {
      const selected = apt.id === state.selected;
      const marker = L.marker([apt.lat, apt.lng], {
        zIndexOffset: selected ? 700 : 100,
        icon: L.divIcon({
          className: 'pin-wrap',
          html: pinHtml(apt, selected),
          iconSize: [0, 0]
        })
      });
      marker.on('click', () => select(apt.id));
      marker.bindTooltip(`${escapeHtml(apt.name)} · ${escapeHtml(apt.district)} ${escapeHtml(apt.dong || '')}`, { direction: 'top', offset: [0, -12] });
      marker.addTo(pinGroup);
      pins.set(apt.id, marker);
    });
    drawLineToSelected();
  }

  function pinHtml(apt, selected) {
    const c = STATUS_COLOR[apt.status] || '#7d8694';
    return `<span class="pin ${selected ? 'sel' : ''}" style="--c:${c}"><i></i><em>${escapeHtml(apt.name)}</em></span>`;
  }

  function refreshPin(apt) {
    const marker = pins.get(apt.id);
    if (!marker) return;
    const selected = apt.id === state.selected;
    marker.setIcon(L.divIcon({ className: 'pin-wrap', html: pinHtml(apt, selected), iconSize: [0, 0] }));
  }

  /* ---------------- filtering ---------------- */
  function matches(apt) {
    if (state.status !== '전체' && apt.status !== state.status) return false;
    if (state.district !== '전체' && apt.district !== state.district) return false;
    const p = apt.price || {};
    if (state.maxDeposit < 13 && Number(p.depositEok || 0) > state.maxDeposit) return false;
    if (state.maxRent < 420 && Number(p.rentManwon || 0) > state.maxRent) return false;
    if (state.q) {
      const hay = [apt.name, apt.district, apt.dong, apt.address, apt.station && apt.station.name, apt.altStation, (apt.tags || []).join(' ')]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    return true;
  }

  function visibleApartments() {
    const list = state.apartments.filter(matches);
    const sorters = {
      distance: (a, b) => distKm(state.baseA, a) - distKm(state.baseA, b),
      rent: (a, b) => (a.price?.rentManwon || 0) - (b.price?.rentManwon || 0),
      deposit: (a, b) => (a.price?.depositEok || 0) - (b.price?.depositEok || 0),
      built: (a, b) => String(b.built || '').localeCompare(String(a.built || '')),
      name: (a, b) => String(a.name).localeCompare(String(b.name), 'ko')
    };
    return list.slice().sort(sorters[state.sort] || sorters.distance);
  }

  /* ---------------- list / chips ---------------- */
  function renderChips() {
    const box = $('#status-chips');
    box.innerHTML = STATUSES.map(s => {
      const n = s === '전체' ? state.apartments.length : state.apartments.filter(a => a.status === s).length;
      const sw = s === '전체' ? '' : `<i class="swatch" style="background:${STATUS_COLOR[s]}"></i>`;
      return `<button class="chip" type="button" data-status="${s}" aria-pressed="${state.status === s}">${sw}${s}<span class="n">${n}</span></button>`;
    }).join('');
    $$('.chip', box).forEach(btn => btn.addEventListener('click', () => {
      state.status = btn.dataset.status;
      renderChips(); renderList();
    }));
  }

  function renderList() {
    const list = visibleApartments();
    const target = $('#list-count');
    const total = state.apartments.length;
    const meetTarget = state.apartments.filter(a => {
      const p = a.price || {};
      return Number(p.depositEok || 0) <= 5.5 && Number(p.rentManwon || 0) >= 200 && Number(p.rentManwon || 0) <= 300;
    }).length;
    target.innerHTML = `${list.length} / ${total}곳 표시 · 5억 내외 / 월 200~300 조건 <b>${meetTarget}곳</b>`;

    const cards = $('#cards');
    cards.innerHTML = list.map(apt => cardHtml(apt)).join('');
    $$('.card', cards).forEach(el => el.addEventListener('click', () => select(el.dataset.id)));
    renderPins();
    if (state.selected && !list.some(a => a.id === state.selected)) closeDetail();
  }

  function cardHtml(apt) {
    const p = apt.price || {};
    const d = distKm(state.baseA, apt);
    const checks = Object.entries(CHECK_LABELS).map(([k, label]) => {
      const v = apt.checklist ? apt.checklist[k] : null;
      const cls = v === true ? 'on' : v === false ? 'off' : '';
      const mark = v === true ? '✓' : v === false ? '!' : '·';
      return `<span class="check-dot ${cls}" title="${label}: ${CHECK_STATE[String(v)][0]}">${mark}</span>`;
    }).join('');
    return `<button class="card ${apt.id === state.selected ? 'active' : ''}" data-id="${apt.id}" type="button">
      <div class="card-top">
        <span class="card-name">
          <span class="status-dot" style="background:${STATUS_COLOR[apt.status] || '#8b95a1'}"></span>
          <h3>${escapeHtml(apt.name)}</h3>
        </span>
        <span class="status-badge">${escapeHtml(apt.status || '미정')}</span>
      </div>
      <div class="card-meta">
        <span>${escapeHtml(apt.district)} ${escapeHtml(apt.dong || '')}</span>
        <span>·</span>
        <span>${apt.station ? `${escapeHtml(apt.station.name)}${apt.station.walkMin ? ' 도보 ' + apt.station.walkMin + '분' : ''}` : '역 정보 없음'}</span>
      </div>
      <div class="card-price">
        <span class="dep">${fmtEok(p.depositEok)}</span>
        <span class="rent">/ ${fmtMan(p.rentManwon)}</span>
        <span class="ex">예시</span>
      </div>
      <div class="card-foot">
        <span class="checks">${checks}</span>
        <span class="card-dist">역삼에서 <b>${d.toFixed(1)}km</b></span>
      </div>
    </button>`;
  }

  /* ---------------- detail ---------------- */
  function select(id) {
    state.selected = id;
    $$('.card').forEach(c => c.classList.toggle('active', c.dataset.id === id));
    pins.forEach((marker, pid) => {
      const apt = byId(pid);
      if (apt) marker.setIcon(L.divIcon({ className: 'pin-wrap', html: pinHtml(apt, pid === id), iconSize: [0, 0] }));
    });
    const apt = byId(id);
    if (apt) {
      state.calc = {
        equity: state.calc.equity,
        rate: state.calc.rate,
        jeonse: Number(apt.price?.jeonseEok || 0),
        deposit: Number(apt.price?.depositEok || 0),
        rent: Number(apt.price?.rentManwon || 0),
        maint: Number(apt.price?.maintenanceManwon || 0)
      };
    }
    renderDetail();
    drawLineToSelected();
    const el = $('#detail');
    el.hidden = false;
    $('#layout').classList.add('has-detail');
    if (window.matchMedia('(max-width: 980px)').matches) $('#sheet-backdrop').hidden = false;
    if (apt && !map.getBounds().pad(-0.25).contains([apt.lat, apt.lng])) {
      map.flyTo([apt.lat, apt.lng], Math.max(map.getZoom(), 13), { duration: 0.5 });
    }
    setTimeout(() => map.invalidateSize(), 60);
  }

  function closeDetail() {
    state.selected = null;
    $('#detail').hidden = true;
    $('#layout').classList.remove('has-detail');
    $('#sheet-backdrop').hidden = true;
    $$('.card').forEach(c => c.classList.remove('active'));
    pins.forEach((marker, pid) => {
      const apt = byId(pid);
      if (apt) marker.setIcon(L.divIcon({ className: 'pin-wrap', html: pinHtml(apt, false), iconSize: [0, 0] }));
    });
    if (lineLayer) { map.removeLayer(lineLayer); lineLayer = null; }
    setTimeout(() => map.invalidateSize(), 60);
  }

  function renderDetail() {
    const apt = byId(state.selected);
    if (!apt) return;
    const p = apt.price || {};
    const dA = distKm(state.baseA, apt);
    const dB = state.baseB ? distKm(state.baseB, apt) : null;
    const bDir = state.baseB ? bearingLabel(bearing(state.baseB, apt)) : '';
    const parking = apt.parking || {};
    const size = apt.size || {};

    const checks = Object.entries(CHECK_LABELS).map(([k, label]) => {
      const v = apt.checklist ? apt.checklist[k] : null;
      const [txt, mark] = CHECK_STATE[String(v)];
      return `<button class="chk-btn" type="button" data-act="check" data-k="${k}" data-v="${String(v)}">
        <span>${label}</span><span class="st">${mark ? mark + ' ' : ''}${txt}</span></button>`;
    }).join('');

    const kakao = `https://map.kakao.com/?q=${encodeURIComponent(apt.name)}`;
    const naverLand = `https://new.land.naver.com/complexes?ms=${apt.lat},${apt.lng},16&a=APT&b=A1&e=RETAIL`;
    const naverMap = `https://map.naver.com/p/search/${encodeURIComponent(apt.name)}`;

    $('#detail').innerHTML = `
      <div class="detail-head">
        <div class="row">
          <div>
            <h2>${escapeHtml(apt.name)}</h2>
            <p class="detail-sub">${escapeHtml(apt.district)} ${escapeHtml(apt.dong || '')} · ${escapeHtml(apt.address || '주소 미기재')}</p>
          </div>
          <button class="icon-btn" type="button" data-act="close" aria-label="상세 닫기">×</button>
        </div>
        <div class="detail-status">
          <span class="seg" role="group" aria-label="상태 변경">
            ${['후보', '임장예정', '보류', '탈락'].map(s => `<button type="button" data-act="status" data-v="${s}" aria-pressed="${apt.status === s}">${s}</button>`).join('')}
          </span>
          ${state.edit ? `<button class="mini ghost" type="button" data-act="delete" style="margin-left:auto;color:#c93a3f">삭제</button>` : ''}
        </div>
      </div>
      <div class="detail-body">
        <section>
          <div class="price-box">
            <div class="big">
              <b>${fmtEok(p.depositEok)}</b><span>/ ${fmtMan(p.rentManwon)}</span>
              ${p.example ? `<span class="ex-tag">검토용 예시</span>` : ''}
            </div>
            <div class="calc-line" style="margin-top:4px">
              <span class="lbl">전세 환산 참고</span><span class="val">${fmtEok(p.jeonseEok)}</span>
            </div>
            ${state.edit ? `<div class="price-edit">
              <label>전세(억)<input type="number" step="0.1" min="0" data-field="jeonseEok" value="${p.jeonseEok ?? ''}"></label>
              <label>보증금(억)<input type="number" step="0.1" min="0" data-field="depositEok" value="${p.depositEok ?? ''}"></label>
              <label>월세(만원)<input type="number" step="5" min="0" data-field="rentManwon" value="${p.rentManwon ?? ''}"></label>
            </div>` : ''}
          </div>
        </section>

        <section>
          <h3 class="sect-title">단지 정보</h3>
          <dl class="kv">
            <div><dt>준공</dt><dd>${escapeHtml(apt.built || '미확인')}${apt.buildings ? ` <span class="mut">${apt.buildings}개동</span>` : ''}</dd></div>
            <div><dt>세대수</dt><dd>${apt.households ? apt.households.toLocaleString('ko-KR') + '세대' : '미확인'}</dd></div>
            <div><dt>가까운 역</dt><dd>${apt.station ? `${escapeHtml(apt.station.name)} <span class="mut">${escapeHtml(apt.station.lines || '')}${apt.station.walkMin ? ' · 도보 ' + apt.station.walkMin + '분' : ''}</span>` : '미확인'}</dd></div>
            <div><dt>주차</dt><dd>${parking.total ? `${parking.total.toLocaleString('ko-KR')}대 <span class="mut">세대당 ${parking.perHousehold ?? '-'}</span>` : '<span class="mut">미확인</span>'}</dd></div>
            <div><dt>검토 평형</dt><dd>${escapeHtml(size.label || '미정')}${size.example ? ' <span class="mut">예시</span>' : ''}</dd></div>
            <div><dt>최고층</dt><dd>${apt.floorMax ? apt.floorMax + '층' : '미확인'}</dd></div>
          </dl>
          ${apt.altStation ? `<p class="calc-note" style="margin-top:7px">${escapeHtml(apt.altStation)}</p>` : ''}
        </section>

        <section>
          <h3 class="sect-title">기준점 거리</h3>
          <div class="commute">
            <div class="commute-row">
              <span class="tag">A</span>
              <span class="v">${dA.toFixed(1)}km</span>
              <span class="band">${bandLabel(dA)}</span>
              <span class="d">지하철 추정 ${estMin(dA)}분</span>
            </div>
            ${state.baseB ? `<div class="commute-row b">
              <span class="tag">B</span>
              <span class="v">${dB.toFixed(1)}km</span>
              <span class="band">${bandLabel(dB)}</span>
              <span class="d">${escapeHtml(state.baseB.name)}에서 ${bDir} 방향</span>
            </div>` : `<div class="commute-row b"><span class="tag">B</span><span class="d">직장 B 미정 — 위 ‘지도 설정’에서 역을 고르거나 지도를 클릭하면 거리·방향이 표시됩니다.</span></div>`}
          </div>
          <p class="calc-note" style="margin-top:6px">추정 시간은 직선거리 1km당 3.2분 + 5분 가정. 실제 환승·도보는 지도 앱에서 확인.</p>
        </section>

        <section>
          <h3 class="sect-title">체크리스트 ${state.edit ? '<span style="font-weight:600;text-transform:none;letter-spacing:0">— 눌러서 변경</span>' : ''}</h3>
          <div class="checks-edit">${checks}</div>
        </section>

        <section>
          <h3 class="sect-title">리뷰 메모</h3>
          ${state.edit
            ? `<textarea class="memo-edit" data-field="memo" placeholder="임장 포인트, 확인할 것">${escapeHtml(apt.memo || '')}</textarea>`
            : `<p class="memo">${escapeHtml(apt.memo || '메모 없음 — 리뷰 편집에서 추가하세요.')}</p>`}
          ${!state.edit ? `<p class="calc-note" style="margin-top:6px">편집하려면 상단 ‘리뷰 편집’을 켜세요.</p>` : ''}
        </section>

        <section>
          <h3 class="sect-title">월 주거비 계산기</h3>
          <div class="calc" id="calc">
            <div class="calc-inputs">
              <label>자기자본(억)<input type="number" step="0.5" min="0" data-calc="equity" value="${state.calc.equity}"></label>
              <label>대출금리(%)<input type="number" step="0.1" min="0" data-calc="rate" value="${state.calc.rate}"></label>
              <label>전세가(억)<input type="number" step="0.1" min="0" data-calc="jeonse" value="${state.calc.jeonse}"></label>
              <label>반전세 보증금(억)<input type="number" step="0.1" min="0" data-calc="deposit" value="${state.calc.deposit}"></label>
              <label>반전세 월세(만원)<input type="number" step="5" min="0" data-calc="rent" value="${state.calc.rent}"></label>
              <label>관리비(만원)<input type="number" step="1" min="0" data-calc="maint" value="${state.calc.maint ?? 0}"></label>
            </div>
            <div class="calc-out" id="calc-out"></div>
            <p class="calc-note">같은 자기자본으로 ‘전세+대출’과 ‘반전세+월세’의 월 고정비를 비교합니다. 관리비는 양쪽에 같게 더합니다. 취득세·대출 한도·보증금 반환 위험은 반영하지 않은 단순 비교.</p>
          </div>
        </section>

        <section>
          <h3 class="sect-title">바로가기</h3>
          <div class="links">
            <a class="link-pill k" href="${kakao}" target="_blank" rel="noopener">카카오맵 검색</a>
            <a class="link-pill n" href="${naverLand}" target="_blank" rel="noopener">네이버부동산</a>
            <a class="link-pill" href="${naverMap}" target="_blank" rel="noopener">네이버 지도</a>
          </div>
        </section>
      </div>`;

    renderCalc();
  }

  function renderCalc() {
    const out = $('#calc-out');
    if (!out) return;
    const c = state.calc;
    const equity = num(c.equity), rate = num(c.rate), jeonse = num(c.jeonse), dep = num(c.deposit), rent = num(c.rent);
    const maint = num(c.maint);
    const jeonseLoan = Math.max(0, jeonse - equity);
    const jeonseInt = jeonseLoan * 1e8 * (rate / 100) / 12;
    const jeonseTotal = jeonseInt + maint * 1e4;

    const depLoan = Math.max(0, dep - equity);
    const depInt = depLoan * 1e8 * (rate / 100) / 12;
    const depTotal = depInt + rent * 1e4 + maint * 1e4;

    const diff = depTotal - jeonseTotal;
    const convRate = jeonse > dep ? (rent * 1e4 * 12) / ((jeonse - dep) * 1e8) * 100 : null;

    out.innerHTML = `
      <div class="calc-line"><span class="lbl">전세안 대출</span><span class="val">${jeonseLoan.toFixed(1)}억 · 이자 ${fmtWon(jeonseInt)}</span></div>
      <div class="calc-line total"><span class="lbl">전세안 월 고정비</span><span class="val">${fmtWon(jeonseTotal)}</span></div>
      <div class="calc-line" style="margin-top:5px"><span class="lbl">반전세안 대출</span><span class="val">${depLoan.toFixed(1)}억 · 이자 ${fmtWon(depInt)}</span></div>
      <div class="calc-line"><span class="lbl">월세 + 관리비</span><span class="val">${fmtWon(rent * 1e4 + maint * 1e4)}</span></div>
      <div class="calc-line total"><span class="lbl">반전세안 월 고정비</span><span class="val">${fmtWon(depTotal)}</span></div>
      <div class="calc-line diff"><span class="lbl">차이 (반전세 − 전세)</span><span class="val ${diff <= 0 ? 'better' : 'worse'}">${diff <= 0 ? '' : '+'}${fmtWon(diff)}</span></div>
      <div class="calc-line"><span class="lbl">2년 누적 차이</span><span class="val ${diff <= 0 ? 'better' : 'worse'}">${fmtWon(diff * 24)}</span></div>
      ${convRate !== null ? `<div class="calc-line"><span class="lbl">전세→반전세 실질 전환금리</span><span class="val">${convRate.toFixed(1)}%</span></div>` : ''}
    `;
  }

  /* ---------------- detail events ---------------- */
  function onDetailClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const apt = byId(state.selected);
    if (!apt) return;
    if (act === 'close') return closeDetail();
    if (act === 'status') {
      apt.status = btn.dataset.v;
      markDirty();
      renderChips(); renderList(); renderDetail(); refreshPin(apt);
      toast(`상태 → ${apt.status}`);
    }
    if (act === 'check') {
      const k = btn.dataset.k;
      apt.checklist = apt.checklist || {};
      const cur = apt.checklist[k];
      apt.checklist[k] = cur === null || cur === undefined ? true : cur === true ? false : null;
      markDirty(); renderDetail(); renderList();
    }
    if (act === 'delete') {
      if (!confirm(`‘${apt.name}’을(를) 목록에서 삭제할까요?`)) return;
      state.apartments = state.apartments.filter(a => a.id !== apt.id);
      markDirty(); closeDetail(); renderChips(); renderList();
      toast('삭제했습니다 — 내보내기로 반영하세요');
    }
  }

  function onDetailInput(e) {
    const apt = byId(state.selected);
    if (!apt) return;
    const t = e.target;
    if (t.dataset.calc) {
      state.calc[t.dataset.calc] = num(t.value);
      renderCalc();
      return;
    }
    if (t.dataset.field === 'memo') {
      apt.memo = t.value;
      markDirty();
      return;
    }
    if (t.dataset.field) {
      const f = t.dataset.field;
      apt.price = apt.price || {};
      apt.price[f] = num(t.value);
      const calcKey = { jeonseEok: 'jeonse', depositEok: 'deposit', rentManwon: 'rent' }[f];
      if (calcKey) state.calc[calcKey] = num(t.value);
      markDirty();
      const big = $('.price-box .big');
      if (big) {
        const p = apt.price;
        big.innerHTML = `<b>${fmtEok(p.depositEok)}</b><span>/ ${fmtMan(p.rentManwon)}</span>` +
          (p.example ? '<span class="ex-tag">검토용 예시</span>' : '');
      }
      const jeonseVal = $('.price-box .calc-line .val');
      if (jeonseVal) jeonseVal.textContent = fmtEok(apt.price.jeonseEok);
      renderCalc();
      renderList();
    }
  }

  /* ---------------- edit mode / dirty ---------------- */
  function setEdit(on) {
    state.edit = on;
    const btn = $('#btn-edit');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '편집 중' : '리뷰 편집';
    $('#btn-add').hidden = !on;
    if (state.selected) renderDetail();
    toast(on ? '편집 모드 — 여기서 바꾼 내용은 이 브라우저에 저장됩니다' : '편집 모드 종료');
  }

  function markDirty() {
    state.dirty = true;
    saveLocal();
    syncDirty();
  }

  function syncDirty() {
    $('#dirty-dot').hidden = !state.dirty;
    $('#btn-export').title = state.dirty ? '저장되지 않은 편집이 있습니다 — JSON으로 내보내 반영하세요' : 'JSON 내보내기';
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        apartments: state.apartments, dirty: state.dirty, baseB: state.baseB, savedAt: new Date().toISOString()
      }));
    } catch (_) { /* storage full or blocked */ }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  /* ---------------- export / import ---------------- */
  function exportJson() {
    const payload = {
      meta: { ...state.meta, updated: new Date().toISOString().slice(0, 10) },
      apartments: state.apartments
    };
    return JSON.stringify(payload, null, 2);
  }

  function openExport() {
    $('#export-text').value = exportJson();
    showModal('modal-export');
  }

  async function copyExport() {
    const text = $('#export-text').value;
    try {
      await navigator.clipboard.writeText(text);
      toast('JSON을 복사했습니다 — data/apartments.json에 붙여넣으세요');
    } catch (_) {
      const ta = $('#export-text');
      ta.removeAttribute('readonly'); ta.select();
      document.execCommand('copy');
      ta.setAttribute('readonly', '');
      toast('복사했습니다 (선택 후 Ctrl/⌘+C)');
    }
  }

  function downloadExport() {
    const blob = new Blob([$('#export-text').value], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'apartments.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('apartments.json 다운로드 — 레포 data/ 폴더에 덮어쓰세요');
  }

  function openImport() {
    $('#import-text').value = '';
    showModal('modal-import');
  }

  function applyImport() {
    const raw = $('#import-text').value.trim();
    if (!raw) return toast('붙여넣은 내용이 없습니다');
    let data;
    try { data = JSON.parse(raw); } catch (err) { return toast('JSON 형식이 아닙니다: ' + err.message); }
    const list = Array.isArray(data) ? data : data.apartments;
    if (!Array.isArray(list)) return toast('apartments 배열을 찾지 못했습니다');
    state.apartments = list.map(normalizeApt);
    if (data.meta) state.meta = { ...state.meta, ...data.meta };
    state.dirty = true;
    saveLocal(); hideModal('modal-import');
    closeDetail(); renderChips(); renderList(); syncDirty();
    toast(`${list.length}곳을 불러왔습니다`);
  }

  function resetData() {
    if (!confirm('브라우저에 저장된 편집을 지우고 기본 데이터로 되돌릴까요?')) return;
    localStorage.removeItem(STORAGE_KEY);
    fetchJson('data/apartments.json').then(d => {
      state.apartments = d.apartments || [];
      state.meta = d.meta || {};
      state.dirty = false;
      hideModal('modal-import');
      closeDetail(); renderChips(); renderList(); syncDirty();
      toast('기본 데이터로 되돌렸습니다');
    }).catch(() => toast('기본 데이터를 불러오지 못했습니다'));
  }

  /* ---------------- new candidate ---------------- */
  function openNew() {
    ['new-name', 'new-dong', 'new-station', 'new-built', 'new-lat', 'new-lng', 'new-memo'].forEach(id => { $('#' + id).value = ''; });
    ['new-jeonse', 'new-deposit', 'new-rent'].forEach(id => { $('#' + id).value = ''; });
    showModal('modal-new');
  }

  function createCandidate() {
    const name = $('#new-name').value.trim();
    const district = $('#new-district').value;
    const lat = parseFloat($('#new-lat').value);
    const lng = parseFloat($('#new-lng').value);
    if (!name) return toast('단지명을 입력하세요');
    if (!isFinite(lat) || !isFinite(lng)) return toast('좌표가 필요합니다 — ‘지도에서 클릭’을 쓰세요');
    const stationRaw = $('#new-station').value.trim();
    const apt = normalizeApt({
      id: 'cand-' + Date.now().toString(36),
      name, district,
      dong: $('#new-dong').value.trim(),
      address: '',
      lat: round5(lat), lng: round5(lng),
      station: stationRaw ? { name: stationRaw, lines: '', walkM: null, walkMin: null } : null,
      built: $('#new-built').value.trim(),
      households: null, buildings: null, floorMax: null,
      parking: { total: null, perHousehold: null },
      size: { label: '미정', example: true },
      price: {
        jeonseEok: num($('#new-jeonse').value),
        depositEok: num($('#new-deposit').value),
        rentManwon: num($('#new-rent').value),
        maintenanceManwon: 0,
        example: true
      },
      status: '후보',
      checklist: { parking: null, condition: null, daylight: null, infra: null },
      memo: $('#new-memo').value.trim(),
      tags: []
    });
    state.apartments.push(apt);
    markDirty(); hideModal('modal-new'); renderChips(); renderList(); select(apt.id);
    toast(`‘${name}’ 추가 — 내보내기로 레포에 반영하세요`);
  }

  function startPicking(kind) {
    state.picking = kind;
    map.getContainer().style.cursor = 'crosshair';
    toast(kind === 'B' ? '지도를 클릭해 직장 B 위치를 지정하세요' : '지도를 클릭해 단지 위치를 지정하세요');
  }

  /* ---------------- base B ---------------- */
  function setBaseB(b) {
    state.baseB = b;
    saveLocal();
    syncBaseB();
    renderList();
    if (state.selected) renderDetail();
    drawLineToSelected();
  }

  /* ---------------- modal helpers ---------------- */
  function showModal(id) { $('#' + id).hidden = false; }
  function hideModal(id) { const m = $('#' + id); if (m) m.hidden = true; }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* ---------------- geo helpers ---------------- */
  function centroid(feature) {
    const geom = feature.geometry;
    const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map(p => p[0]);
    let best = null, bestArea = 0;
    rings.forEach(ring => {
      let s = 0, cx = 0, cy = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const x1 = ring[j][0], y1 = ring[j][1], x2 = ring[i][0], y2 = ring[i][1];
        const f = x1 * y2 - x2 * y1;
        s += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
      }
      const area = Math.abs(s / 2);
      if (area > bestArea && s !== 0) {
        bestArea = area;
        best = [cy / (3 * s), cx / (3 * s)];
      }
    });
    const bb = L.geoJSON(feature).getBounds();
    if (!best || !isFinite(best[0]) || !isFinite(best[1]) || !bb.contains(L.latLng(best[0], best[1]))) {
      return bb.getCenter();
    }
    return L.latLng(best[0], best[1]);
  }

  function distKm(a, b) {
    const R = 6371;
    const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
    const dp = p2 - p1, dl = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function bearing(a, b) {
    const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
    const dl = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function bearingLabel(deg) {
    const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    return dirs[Math.round(deg / 45) % 8];
  }

  function bandLabel(km) {
    if (km < 1.5) return '도보·자전거권';
    if (km < 3) return '근거리';
    if (km < 8) return '대중교통권';
    return '원거리';
  }

  function estMin(km) { return Math.max(5, Math.round(5 + km * 3.2)); }

  /* ---------------- format helpers ---------------- */
  const num = v => {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  };
  const round5 = v => Math.round(v * 1e5) / 1e5;
  const fmtEok = v => (v === null || v === undefined || v === '' ? '보증금 ?' : `${trimNum(v)}억`);
  const fmtMan = v => (v === null || v === undefined || v === '' ? '월세 ?' : `${trimNum(v)}만`);
  function trimNum(v) {
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
  }
  function fmtWon(won) {
    if (!isFinite(won)) return '-';
    const sign = won < 0 ? '−' : '';
    const abs = Math.abs(won);
    if (abs >= 1e4) {
      const man = abs / 1e4;
      return `${sign}${groupNum(man >= 100 ? Math.round(man) : man.toFixed(0))}만원`;
    }
    return `${sign}${groupNum(Math.round(abs))}원`;
  }
  function groupNum(v) {
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function byId(id) { return state.apartments.find(a => a.id === id); }

  function normalizeApt(a) {
    const price = a.price || {};
    return {
      id: a.id || 'apt-' + Math.random().toString(36).slice(2, 8),
      name: a.name || '이름 없음',
      district: a.district || '미지정',
      dong: a.dong || '',
      address: a.address || '',
      lat: Number(a.lat),
      lng: Number(a.lng),
      station: a.station || null,
      altStation: a.altStation || '',
      built: a.built || '',
      households: a.households ?? null,
      buildings: a.buildings ?? null,
      floorMax: a.floorMax ?? null,
      parking: a.parking || { total: null, perHousehold: null },
      size: a.size || { label: '미정', example: true },
      price: {
        jeonseEok: price.jeonseEok ?? null,
        depositEok: price.depositEok ?? null,
        rentManwon: price.rentManwon ?? null,
        maintenanceManwon: price.maintenanceManwon ?? 0,
        example: price.example !== false
      },
      status: a.status || '후보',
      checklist: a.checklist || { parking: null, condition: null, daylight: null, infra: null },
      memo: a.memo || '',
      tags: a.tags || []
    };
  }
})();
