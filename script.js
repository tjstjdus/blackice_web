const API_BASE = "https://blackice-server-prjr.onrender.com";

let map;
let liveMap;

let markers = [];
let liveMarkers = [];

let riskChart;
let regions = {};

let realtimeMode = false;
let liveTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initMap();
    initLiveMap();
    initChart();

    await loadRegions();

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

    document.getElementById("liveUpdatedAt").innerText =
      `실시간 업데이트: ${now.date} ${now.time}`;

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
      updateLiveMap(results);
      setMainMap("live");
    } else {
      updateMap(results);
      updateLiveMap(results);
      setMainMap("selected");
    }

    updateChart(results);
    updateTable(results);

    document.getElementById("selectedMapSub").innerText =
      realtimeMode
        ? `${province} ${city} · 실시간 기준`
        : `${province} ${city} · ${date} ${time}`;

    document.getElementById("liveMapSub").innerText =
      `${province} ${city} · 실시간 기준`;

  } catch (error) {
    console.error(error);
    alert("예측 실패");
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

function updateTable(results) {
  const tbody = document.getElementById("resultTable");
  tbody.innerHTML = "";

  results.slice(0, 10).forEach((r, i) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${i + 1}</td>

      <td>
        ${r.시도 || ""}
        ${r.시군구 || ""}
        ${r.읍면동 || ""}
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
