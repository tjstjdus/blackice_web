const API_BASE = "https://blackice-server-prjr.onrender.com";

let map;
let liveMap;

let markers = [];
let liveMarkers = [];

// 기상 관측소 마커
let stationMarkers = [];
let liveStationMarkers = [];

let riskChart;
let regions = {};

let realtimeMode = false;
let liveTimer = null;

// ── 전국 고속도로 예측 관련 전역 변수 ──
let nationwideMap;
let nationwideMarkers = [];
let nationwideMarkerMap = {};      // pointKey → Leaflet marker
let nationwideAllResults = [];     // 서버에서 받아온 전체 지점
let nationwideVisibleTop = [];     // 현재 화면에 보이는 위험도 상위 지점
let nationwideCurrentOffset = 0;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initMap();
    initLiveMap();
    initChart();
    initNationwideMap();

    await loadRegions();
    await loadStations();   // 페이지 로드 시 관측소 마커 표시
    await loadNationwideForecast(0);

    setDateLimit();
  } catch (error) {
    console.error(error);
    alert("초기 로딩 실패");
  }
});

function setDateLimit() {
  const now = new Date();
  const futureLimit = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  const yyyy = futureLimit.getFullYear();
  const mm = String(futureLimit.getMonth() + 1).padStart(2, "0");
  const dd = String(futureLimit.getDate()).padStart(2, "0");

  document.getElementById("date").max = `${yyyy}-${mm}-${dd}`;

  document.getElementById("date").addEventListener("change", validateFutureTime);
  document.getElementById("time").addEventListener("change", validateFutureTime);
}

function validateFutureTime() {
  const date = document.getElementById("date").value;
  const time = document.getElementById("time").value;

  if (!date || !time) return;

  const selected = new Date(`${date}T${time}`);
  const futureLimit = new Date(Date.now() + 6 * 60 * 60 * 1000);

  if (selected > futureLimit) {
    alert("미래 예측은 현재 기준 6시간 이내만 가능합니다.");

    const hh = String(futureLimit.getHours()).padStart(2, "0");
    const mi = String(futureLimit.getMinutes()).padStart(2, "0");

    document.getElementById("time").value = `${hh}:${mi}`;
  }
}

async function loadRegions() {
  const provinceSelect = document.getElementById("province");
  const citySelect = document.getElementById("city");

  provinceSelect.innerHTML = `<option>불러오는 중...</option>`;
  citySelect.innerHTML = `<option>불러오는 중...</option>`;

  try {
    const response = await fetch(`${API_BASE}/regions`);
    const data = await response.json();

    regions = data.regions;
    provinceSelect.innerHTML = "";

    Object.keys(regions).forEach((province) => {
      const option = document.createElement("option");
      option.value = province;
      option.textContent = province;
      provinceSelect.appendChild(option);
    });

    updateCityOptions();

    provinceSelect.addEventListener("change", () => {
      updateCityOptions();

      if (realtimeMode) {
        startRealtimeMode();
      }
    });

    citySelect.addEventListener("change", () => {
      if (realtimeMode) {
        startRealtimeMode();
      }
    });

  } catch (error) {
    console.error(error);
    provinceSelect.innerHTML = `<option>실패</option>`;
    citySelect.innerHTML = `<option>실패</option>`;
  }
}

function updateCityOptions() {
  const province = document.getElementById("province").value;
  const citySelect = document.getElementById("city");

  citySelect.innerHTML = "";

  if (!regions[province]) return;

  regions[province].forEach((city) => {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    citySelect.appendChild(option);
  });
}

function initMap() {
  map = L.map("map").setView([36.5, 127.8], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18
  }).addTo(map);
}

function initLiveMap() {
  liveMap = L.map("liveMap").setView([36.5, 127.8], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18
  }).addTo(liveMap);
}

function initChart() {
  const ctx = document.getElementById("riskChart");

  riskChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "위험도",
          data: [],
          borderRadius: 12,
          backgroundColor: []
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });
}

function changeMode() {
  const mode = document.getElementById("modeSelect").value;
  const dateInput = document.getElementById("date");
  const timeInput = document.getElementById("time");

  if (mode === "realtime") {
    realtimeMode = true;

    dateInput.disabled = true;
    timeInput.disabled = true;

    startRealtimeMode();
    setMainMap("live");

  } else {
    realtimeMode = false;

    dateInput.disabled = false;
    timeInput.disabled = false;

    clearInterval(liveTimer);
    setMainMap("selected");
  }
}

function startRealtimeMode() {
  runRealtimePrediction();

  clearInterval(liveTimer);
  liveTimer = setInterval(runRealtimePrediction, 300000);
}

async function runRealtimePrediction() {
  const province = document.getElementById("province").value;
  const city = document.getElementById("city").value;
  const now = getCurrentDateTime();

  try {
    const response = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: now.date,
        time: now.time,
        province,
        city,
        max_points: 20
      })
    });

    const data = await response.json();

    if (data.status !== "success") {
      console.warn(data.message || "실시간 예측 실패");
      return;
    }
    
    if (!data.results || data.results.length === 0) {
      console.warn("실시간 결과 없음");
      return;
    }
    
    const results = data.results;

    if (!results || results.length === 0) {
      return;
    }

    results.sort((a, b) =>
      Number(b.blackice_probability_percent || 0) -
      Number(a.blackice_probability_percent || 0)
    );

    updateAverageCards(results);
    updateLiveMap(results);
    updateChart(results);
    updateTable(results);

    document.getElementById("selectedMapSub").innerText =
      `${province} ${city} · 선택 시각 기준`;

    document.getElementById("liveMapSub").innerText =
      `${province} ${city} · 실시간 기준 ${now.date} ${now.time}`;

    setMainMap("live");

    const liveUpdatedEl = document.getElementById("liveUpdatedAt");
    if (liveUpdatedEl) {
      liveUpdatedEl.innerText = `실시간 업데이트: ${now.date} ${now.time}`;
    }

  } catch (error) {
    console.error(error);
  }
}

async function predictRisk() {
  const date = document.getElementById("date").value;
  const time = document.getElementById("time").value;
  const province = document.getElementById("province").value;
  const city = document.getElementById("city").value;

  if (!realtimeMode && (!date || !time)) {
    alert("날짜와 시간을 선택해주세요.");
    return;
  }

  try {
    const bodyData = realtimeMode
      ? {
          ...getCurrentDateTime(),
          province,
          city,
          max_points: 20
        }
      : {
          date,
          time,
          province,
          city,
          max_points: 20
        };

    const response = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bodyData)
    });

    const data = await response.json();

    if (data.status !== "success") {
      alert(data.message || "예측 실패");
      return;
    }
    
    if (!data.results || data.results.length === 0) {
      alert("결과 없음");
      return;
    }
    
    const results = data.results;

    if (!results || results.length === 0) {
      alert("결과 없음");
      return;
    }

    results.sort((a, b) =>
      Number(b.blackice_probability_percent || 0) -
      Number(a.blackice_probability_percent || 0)
    );

    updateAverageCards(results);

    if (realtimeMode) {
      // 실시간 모드: 양쪽 모두 현재 시각 결과
      updateLiveMap(results);
      setMainMap("live");

      document.getElementById("selectedMapSub").innerText =
        `${province} ${city} · 실시간 기준`;
      document.getElementById("liveMapSub").innerText =
        `${province} ${city} · 실시간 기준`;

    } else {
      // 날짜 선택 모드: 왼쪽은 선택 날짜, 오른쪽은 현재 시각으로 별도 호출
      updateMap(results);
      setMainMap("selected");

      document.getElementById("selectedMapSub").innerText =
        `${province} ${city} · ${date} ${time}`;

      // 오른쪽 지도 — 현재 시각으로 별도 API 호출
      fetchLiveMap(province, city);
    }

    updateChart(results);
    updateTable(results);

  } catch (error) {
    console.error(error);
    alert("예측 실패");
  }
}

// 오른쪽 지도 전용 — 항상 현재 시각으로 호출
async function fetchLiveMap(province, city) {
  const now = getCurrentDateTime();

  document.getElementById("liveMapSub").innerText =
    `${province} ${city} · 실시간 ${now.date} ${now.time} 기준`;

  try {
    const response = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: now.date,
        time: now.time,
        province,
        city,
        max_points: 20
      })
    });

    const data = await response.json();

    if (data.status !== "success" || !data.results?.length) {
      console.warn("실시간 지도 결과 없음:", data.message);
      document.getElementById("liveMapSub").innerText =
        `${province} ${city} · 실시간 데이터 없음`;
      return;
    }

    const results = data.results.sort((a, b) =>
      Number(b.blackice_probability_percent || 0) -
      Number(a.blackice_probability_percent || 0)
    );

    updateLiveMap(results);

  } catch (error) {
    console.error("실시간 지도 호출 실패:", error);
    document.getElementById("liveMapSub").innerText =
      `${province} ${city} · 실시간 로드 실패`;
  }
}

function setMainMap(type) {
  const grid = document.getElementById("mapCompareGrid");

  grid.classList.remove("selected-large", "live-large");

  if (type === "selected") {
    grid.classList.add("selected-large");
  } else if (type === "live") {
    grid.classList.add("live-large");
  }

  setTimeout(() => {
    map.invalidateSize(true);
    liveMap.invalidateSize(true);
  }, 600);
}

function resetMapLayout() {
  const grid = document.getElementById("mapCompareGrid");

  grid.classList.remove("selected-large", "live-large");

  setTimeout(() => {
    map.invalidateSize(true);
    liveMap.invalidateSize(true);
  }, 600);
}

function getCurrentDateTime() {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${mi}`
  };
}

function average(values) {
  const nums = values
    .map(v => Number(v))
    .filter(v => !Number.isNaN(v));

  if (nums.length === 0) return null;

  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "정보 없음";
  }

  return Number(value).toFixed(1) + "%";
}

function formatValue(value, unit = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "정보 없음";
  }

  return Number(value).toFixed(1) + unit;
}

function getAverageRiskLevel(avgRisk) {
  if (avgRisk >= 80) return "매우 위험";
  if (avgRisk >= 60) return "위험";
  if (avgRisk >= 30) return "주의";
  return "낮음";
}

function updateAverageCards(results) {
  const avgBlackice = average(results.map(r => r.blackice_probability_percent));
  const avgIcing = average(results.map(r => r.icing_probability_percent));
  const avgTemp = average(results.map(r => r.기온));
  const avgHumidity = average(results.map(r => r.습도));
  const avgWind = average(results.map(r => r.풍속));

  document.getElementById("mainRisk").innerText = formatPercent(avgBlackice);
  document.getElementById("icingProb").innerText = formatPercent(avgIcing);
  document.getElementById("temp").innerText = formatValue(avgTemp, "℃");
  document.getElementById("humidity").innerText = formatValue(avgHumidity, "%");
  document.getElementById("wind").innerText = formatValue(avgWind, "m/s");

  document.getElementById("riskLevel").innerText =
    "지역 평균 " + getAverageRiskLevel(avgBlackice);
}

function getRiskColorByPercent(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const hue = 120 - (p * 1.2);

  return `hsl(${hue},85%,48%)`;
}

function updateMap(results) {
  markers.forEach(marker => {
    map.removeLayer(marker);
  });

  markers = [];

  results.forEach((r) => {
    const lat = Number(r["위도"]);
    const lon = Number(r["경도"]);

    if (Number.isNaN(lat) || Number.isNaN(lon)) return;

    const color = getRiskColorByPercent(r.blackice_probability_percent);

    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      color,
      fillColor: color,
      fillOpacity: 0.85
    })
      .addTo(map)
      .bindPopup(`
        <b>${r.시도 || ""} ${r.시군구 || ""} ${r.읍면동 || ""}</b><br>
        위험도: ${formatPercent(r.blackice_probability_percent)}<br>
        결빙확률: ${formatPercent(r.icing_probability_percent)}<br>
        기온: ${formatValue(r.기온, "℃")}<br>
        습도: ${formatValue(r.습도, "%")}<br>
        풍속: ${formatValue(r.풍속, "m/s")}
      `);

    marker.on("click", () => {
      map.setView([lat, lon], 15, {
        animate: true,
        duration: 1.5
      });

      setMainMap("selected");
      marker.openPopup();
    });

    markers.push(marker);
  });

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  }

  // 기상 관측소 마커 표시
  addStationMarkers(map, results, stationMarkers, "station");
}

function updateLiveMap(results) {
  liveMarkers.forEach(marker => {
    liveMap.removeLayer(marker);
  });

  liveMarkers = [];

  results.forEach((r) => {
    const lat = Number(r["위도"]);
    const lon = Number(r["경도"]);

    if (Number.isNaN(lat) || Number.isNaN(lon)) return;

    const color = getRiskColorByPercent(r.blackice_probability_percent);

    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      color,
      fillColor: color,
      fillOpacity: 0.85
    })
      .addTo(liveMap)
      .bindPopup(`
        <b>${r.시도 || ""} ${r.시군구 || ""} ${r.읍면동 || ""}</b><br>
        실시간 위험도: ${formatPercent(r.blackice_probability_percent)}<br>
        결빙확률: ${formatPercent(r.icing_probability_percent)}<br>
        기온: ${formatValue(r.기온, "℃")}<br>
        습도: ${formatValue(r.습도, "%")}<br>
        풍속: ${formatValue(r.풍속, "m/s")}
      `);

    marker.on("click", () => {
      liveMap.setView([lat, lon], 15, {
        animate: true,
        duration: 1.5
      });

      setMainMap("live");
      marker.openPopup();
    });

    liveMarkers.push(marker);
  });

  if (liveMarkers.length > 0) {
    const group = L.featureGroup(liveMarkers);
    liveMap.fitBounds(group.getBounds().pad(0.2));
  }

  // 기상 관측소 마커 표시
  addStationMarkers(liveMap, results, liveStationMarkers, "liveStation");
}

function zoomToLocation(lat, lon) {
  if (Number.isNaN(lat) || Number.isNaN(lon)) return;

  if (realtimeMode) {
    liveMap.setView([lat, lon], 15, {
      animate: true,
      duration: 1.5
    });

    setMainMap("live");
  } else {
    map.setView([lat, lon], 15, {
      animate: true,
      duration: 1.5
    });

    setMainMap("selected");
  }
}

function updateChart(results) {
  const top = results.slice(0, 10);

  riskChart.data.labels = top.map((r, i) =>
    r.읍면동 ? r.읍면동 : `지점 ${i + 1}`
  );

  riskChart.data.datasets[0].data = top.map(r =>
    Number(r.blackice_probability_percent || 0).toFixed(1)
  );

  riskChart.data.datasets[0].backgroundColor = top.map(r =>
    getRiskColorByPercent(r.blackice_probability_percent)
  );

  riskChart.update();

  document.getElementById("riskChart").onclick = function(evt) {
    const points = riskChart.getElementsAtEventForMode(
      evt,
      "nearest",
      { intersect: true },
      true
    );

    if (points.length) {
      const index = points[0].index;
      const selected = top[index];

      zoomToLocation(
        Number(selected["위도"]),
        Number(selected["경도"])
      );
    }
  };
}

// =========================================================
// 기상 관측소 — /stations API 호출 후 양쪽 지도에 마커 표시
// =========================================================

// 관측소 원본 데이터 캐시 (한 번만 fetch)
let stationsCache = null;

async function loadStations() {
  try {
    const res = await fetch(`${API_BASE}/stations`);
    const data = await res.json();

    if (data.status !== "success" || !data.stations.length) {
      console.warn("관측소 데이터 없음");
      return;
    }

    stationsCache = data.stations;

    // 페이지 로드 시 양쪽 지도에 모두 표시
    renderStationMarkers(map, stationMarkers);
    renderStationMarkers(liveMap, liveStationMarkers);

  } catch (e) {
    console.error("관측소 로드 실패:", e);
  }
}

function renderStationMarkers(targetMap, markerArray) {
  // 기존 관측소 마커 제거
  markerArray.forEach(m => targetMap.removeLayer(m));
  markerArray.length = 0;

  if (!stationsCache) return;

  stationsCache.forEach(s => {
    const lat = Number(s.asos_lat);
    const lon = Number(s.asos_lon);

    if (Number.isNaN(lat) || Number.isNaN(lon)) return;

    // 관측소 아이콘 — 남색 사각형
    const icon = L.divIcon({
      className: "",
      html: `
        <div style="
          width: 24px; height: 24px;
          background: #1B2D6B;
          border: 2px solid #FFFFFF;
          border-radius: 4px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 5px rgba(0,0,0,0.35);
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="white" stroke-width="2.5" stroke-linecap="round">
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
          </svg>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -16]
    });

    const marker = L.marker([lat, lon], { icon })
      .addTo(targetMap)
      .bindPopup(`
        <div style="font-family:'Noto Sans KR',sans-serif; min-width:160px;">
          <div style="font-size:11px; font-weight:700; color:#1B2D6B;
            letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px;">
            기상 관측소
          </div>
          <div style="font-size:14px; font-weight:700; color:#1A1A1A; margin-bottom:4px;">
            ${s.asos_name || ""}
          </div>
          <div style="font-size:12px; color:#808285; margin-bottom:10px;">
            관측소 ID: ${s.asos_id || ""}
          </div>
          <div style="font-size:12px; color:#333; line-height:1.9;">
            위도: ${Number(lat).toFixed(4)}<br>
            경도: ${Number(lon).toFixed(4)}
          </div>
        </div>
      `);

    markerArray.push(marker);
  });
}

// predict 결과가 나온 뒤 호출 — 기존 관측소 마커는 유지하되 갱신
function addStationMarkers(targetMap, results, markerArray) {
  // /stations API 기반으로 이미 마커가 그려져 있으면 유지
  // predict 결과의 기상 데이터를 팝업에 반영하고 싶다면 아래 로직 확장 가능
  if (stationsCache) return;

  // fallback: /stations API 없을 때 predict 결과에서 asos 위치 추정
  markerArray.forEach(m => targetMap.removeLayer(m));
  markerArray.length = 0;

  const seen = new Set();
  results.forEach(r => {
    if (!r.asos_id || seen.has(r.asos_id)) return;
    seen.add(r.asos_id);

    const lat = Number(r["위도"]);
    const lon = Number(r["경도"]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;

    const icon = L.divIcon({
      className: "",
      html: `<div style="width:20px;height:20px;background:#1B2D6B;border:2px solid #fff;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -14]
    });

    const marker = L.marker([lat, lon], { icon })
      .addTo(targetMap)
      .bindPopup(`<b>${r.asos_name || ""}</b> (${r.asos_id || ""})<br>기온: ${formatValue(r.기온, "℃")}`);

    markerArray.push(marker);
  });
}

function updateTable(results) {
  const tbody = document.getElementById("resultTable");
  tbody.innerHTML = "";

  results.slice(0, 10).forEach((r, i) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${i + 1}</td>
    
      <td>
        ${[r.시도, r.시군구, r.읍면동].filter(Boolean).join(" ")}
        <br>
        <small>
          위도 ${Number(r.위도).toFixed(5)},
          경도 ${Number(r.경도).toFixed(5)}
        </small>
      </td>
    
      <td>${formatPercent(r.blackice_probability_percent)}</td>
      <td>${formatPercent(r.icing_probability_percent)}</td>
    `;

    row.addEventListener("click", () => {
      zoomToLocation(
        Number(r["위도"]),
        Number(r["경도"])
      );
    });

    tbody.appendChild(row);
  });
}
// =========================================================
// 전국 고속도로 미래 예측 — 지도 초기화
// =========================================================

function initNationwideMap() {
  nationwideMap = L.map("nationwideMap", {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([36.2, 127.8], 7);   // 전국 줌아웃 뷰

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "",
    maxZoom: 18
  }).addTo(nationwideMap);

  // 지도를 움직이거나 줌할 때마다 현재 화면 기준으로 사이드바 갱신
  nationwideMap.on("moveend zoomend", () => {
    updateVisibleRankList();
  });
}

// =========================================================
// 탭 전환 — 현재 / 30분 후 / 1시간 후
// =========================================================

function switchNationwideTab(offsetMinutes, btnEl) {
  document.querySelectorAll(".nf-tab").forEach(b => b.classList.remove("active"));
  btnEl.classList.add("active");

  closeNfDetail();
  loadNationwideForecast(offsetMinutes);
}

// =========================================================
// 전국 예측 데이터 로드
// =========================================================

async function loadNationwideForecast(offsetMinutes) {
  nationwideCurrentOffset = offsetMinutes;

  const badge = document.getElementById("nfZoomBadge");
  const rankList = document.getElementById("nfRankList");

  badge.innerText = "전국 지점 위험도 분석 중...";
  rankList.innerHTML = `<div class="nf-loading">데이터 로딩 중...</div>`;

  try {
    // top_n을 크게 잡아서 사실상 전체 지점을 다 받아온 뒤
    // 화면에 보이는 지점만 골라 사이드바에 표시
    const res = await fetch(
      `${API_BASE}/predict/nationwide?offset_minutes=${offsetMinutes}&top_n=9999`
    );
    const data = await res.json();

    if (data.status !== "success" || !data.results?.length) {
      badge.innerText = "예측 데이터 없음";
      rankList.innerHTML = `<div class="nf-loading">데이터를 불러오지 못했습니다.</div>`;
      return;
    }

    nationwideAllResults = data.results;

    renderNationwideMarkers(nationwideAllResults);

    const label = offsetMinutes === 0 ? "현재" :
                  offsetMinutes === 30 ? "30분 후" : "1시간 후";
    badge.innerText = `${label} 기준 · ${data.target_time || ""}`;

    // 전국 뷰로 리셋 — 자동 줌인 없음, 사용자가 직접 탐색
    nationwideMap.setView([36.2, 127.8], 7, { animate: true });

    // 현재 화면 기준으로 사이드바 채우기
    updateVisibleRankList();

  } catch (e) {
    console.error("전국 예측 로드 실패:", e);
    badge.innerText = "로드 실패 — 다시 시도해주세요";
    rankList.innerHTML = `<div class="nf-loading">서버 연결에 실패했습니다.</div>`;
  }
}

// =========================================================
// 지도 마커 렌더링 (전체 지점)
// =========================================================

function getRiskColor(pct) {
  if (pct >= 80) return "#ED1B2F";
  if (pct >= 60) return "#E67E22";
  if (pct >= 30) return "#F5A623";
  return "#27AE60";
}

function pointKey(r) {
  return `${r.asos_id}_${r["위도"]}_${r["경도"]}`;
}

function renderNationwideMarkers(results) {
  nationwideMarkers.forEach(m => nationwideMap.removeLayer(m));
  nationwideMarkers = [];
  nationwideMarkerMap = {};

  results.forEach(r => {
    const lat = Number(r["위도"]);
    const lon = Number(r["경도"]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;

    const pct = Number(r.blackice_probability_percent || 0);
    const color = getRiskColor(pct);
    const isHigh = pct >= 50;

    const icon = L.divIcon({
      className: "",
      html: `
        <div style="
          width: ${isHigh ? 13 : 9}px; height: ${isHigh ? 13 : 9}px;
          background: ${color};
          border: 1.5px solid #fff;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.35);
        "></div>
      `,
      iconSize: [isHigh ? 13 : 9, isHigh ? 13 : 9],
      iconAnchor: [isHigh ? 6.5 : 4.5, isHigh ? 6.5 : 4.5],
      popupAnchor: [0, -10]
    });

    const marker = L.marker([lat, lon], { icon })
      .addTo(nationwideMap)
      .on("click", () => flyToPoint(r));

    marker.bindPopup(`
      <div style="font-family:'Noto Sans KR',sans-serif; min-width:150px;">
        <div style="font-size:13px; font-weight:700; color:#1A1A1A; margin-bottom:4px;">
          ${r["시도"] || ""} ${r["시군구"] || ""} ${r["읍면동"] || ""}
        </div>
        <div style="font-size:12px; color:${color}; font-weight:700;">
          위험도 ${pct.toFixed(1)}%
        </div>
      </div>
    `);

    nationwideMarkers.push(marker);
    nationwideMarkerMap[pointKey(r)] = marker;
  });
}

// =========================================================
// 현재 화면(viewport)에 보이는 지점 중 위험도 상위 → 사이드바
// =========================================================

function updateVisibleRankList() {
  if (!nationwideAllResults.length) return;

  const bounds = nationwideMap.getBounds();

  const visible = nationwideAllResults.filter(r => {
    const lat = Number(r["위도"]);
    const lon = Number(r["경도"]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
    return bounds.contains([lat, lon]);
  });

  const sorted = visible.sort(
    (a, b) =>
      Number(b.blackice_probability_percent || 0) -
      Number(a.blackice_probability_percent || 0)
  );

  nationwideVisibleTop = sorted.slice(0, 15);
  renderRankList(nationwideVisibleTop, visible.length);
}

// =========================================================
// 우측 랭킹 패널 렌더링
// =========================================================

function renderRankList(topRisk, totalVisibleCount) {
  const rankList = document.getElementById("nfRankList");
  const countLabel = document.getElementById("nfVisibleCount");

  if (countLabel) {
    countLabel.innerText = totalVisibleCount != null
      ? `현재 화면 내 ${totalVisibleCount}개 지점`
      : "";
  }

  if (!topRisk.length) {
    rankList.innerHTML = `<div class="nf-loading">현재 화면에 표시된 지점이 없습니다.<br>지도를 이동하거나 축소해보세요.</div>`;
    return;
  }

  rankList.innerHTML = topRisk.map((r, i) => {
    const pct = Number(r.blackice_probability_percent || 0);
    const color = getRiskColor(pct);
    const name = `${r["시군구"] || ""} ${r["읍면동"] || ""}`.trim() || r["시도"] || "지점";

    return `
      <div class="nf-rank-item" data-key="${pointKey(r)}" onclick="flyToRankItem('${pointKey(r)}')">
        <div class="nf-rank-num" style="background:${color};">${i + 1}</div>
        <div class="nf-rank-name">${name}</div>
        <div class="nf-rank-val" style="color:${color};">${pct.toFixed(0)}%</div>
      </div>
    `;
  }).join("");
}

// =========================================================
// flyTo — 특정 지점으로 부드럽게 줌인
// =========================================================

function flyToPoint(r) {
  const lat = Number(r["위도"]);
  const lon = Number(r["경도"]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return;

  nationwideMap.flyTo([lat, lon], 13, { duration: 1.6 });

  const name = `${r["시군구"] || ""} ${r["읍면동"] || ""}`.trim() || r["시도"] || "선택 지점";
  document.getElementById("nfZoomBadge").innerText = `${name} 확대 중`;

  showNfDetail(r);
  highlightRankItem(r);

  // 해당 마커 팝업도 함께 오픈
  const marker = nationwideMarkerMap[pointKey(r)];
  if (marker) {
    setTimeout(() => marker.openPopup(), 1700);
  }
}

function flyToRankItem(key) {
  const r = nationwideVisibleTop.find(item => pointKey(item) === key)
         || nationwideAllResults.find(item => pointKey(item) === key);
  if (!r) return;
  flyToPoint(r);
}

function highlightRankItem(r) {
  document.querySelectorAll(".nf-rank-item").forEach(el => el.classList.remove("active"));
  const el = document.querySelector(`.nf-rank-item[data-key="${pointKey(r)}"]`);
  if (el) el.classList.add("active");
}

// =========================================================
// 사이드 상세 패널
// =========================================================

function showNfDetail(r) {
  const panel = document.getElementById("nfDetailPanel");
  panel.style.display = "block";

  const name = `${r["시도"] || ""} ${r["시군구"] || ""} ${r["읍면동"] || ""}`.trim();
  const pct = Number(r.blackice_probability_percent || 0);

  document.getElementById("nfDetailName").innerText = name || "지점 정보 없음";
  document.getElementById("nfDetailRisk").innerText = `${pct.toFixed(1)}%`;
  document.getElementById("nfDetailIcing").innerText = formatValue(r.icing_probability_percent, "%");
  document.getElementById("nfDetailTemp").innerText = formatValue(r.기온, "℃");
  document.getElementById("nfDetailHumidity").innerText = formatValue(r.습도, "%");
  document.getElementById("nfDetailWind").innerText = formatValue(r.풍속, "m/s");
  document.getElementById("nfDetailStation").innerText = r.asos_name || "-";
}

function closeNfDetail() {
  document.getElementById("nfDetailPanel").style.display = "none";
  document.querySelectorAll(".nf-rank-item").forEach(el => el.classList.remove("active"));
}

// 전국 보기로 되돌아가기
function resetNationwideView() {
  nationwideMap.setView([36.2, 127.8], 7, { animate: true });
  document.getElementById("nfZoomBadge").innerText =
    `전국 지점 보기 · ${nationwideCurrentOffset === 0 ? "현재" :
      nationwideCurrentOffset === 30 ? "30분 후" : "1시간 후"} 기준`;
}
