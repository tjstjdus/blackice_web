const API_BASE = "https://blackice-server-prjr.onrender.com";

let map;
let markers = [];
let riskChart;
let regions = {};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initMap();
    initChart();
    await loadRegions();
  } catch (error) {
    console.error("초기 실행 오류:", error);
    alert("초기 데이터를 불러오지 못했습니다. 콘솔을 확인해주세요.");
  }
});

async function loadRegions() {
  const provinceSelect = document.getElementById("province");
  const citySelect = document.getElementById("city");

  provinceSelect.innerHTML = `<option>불러오는 중...</option>`;
  citySelect.innerHTML = `<option>불러오는 중...</option>`;

  try {
    const response = await fetch(`${API_BASE}/regions`);

    if (!response.ok) {
      throw new Error("지역 API 응답 오류: " + response.status);
    }

    const data = await response.json();

    if (data.status !== "success" || !data.regions) {
      throw new Error("지역 데이터 형식 오류");
    }

    regions = data.regions;

    provinceSelect.innerHTML = "";

    Object.keys(regions).forEach((province) => {
      const option = document.createElement("option");
      option.value = province;
      option.textContent = province;
      provinceSelect.appendChild(option);
    });

    updateCityOptions();

    provinceSelect.addEventListener("change", updateCityOptions);

  } catch (error) {
    console.error("지역 목록 불러오기 실패:", error);

    provinceSelect.innerHTML = `<option>지역 불러오기 실패</option>`;
    citySelect.innerHTML = `<option>지역 불러오기 실패</option>`;
  }
}

function updateCityOptions() {
  const province = document.getElementById("province").value;
  const citySelect = document.getElementById("city");

  citySelect.innerHTML = "";

  if (!regions[province]) {
    citySelect.innerHTML = `<option>시 목록 없음</option>`;
    return;
  }

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
          borderRadius: 12
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

async function predictRisk() {
  const date = document.getElementById("date").value;
  const time = document.getElementById("time").value;
  const province = document.getElementById("province").value;
  const city = document.getElementById("city").value;

  if (!date || !time) {
    alert("날짜와 시간을 선택해주세요.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: date,
        time: time,
        province: province,
        city: city,
        max_points: 20
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("예측 API 오류:", errorText);
      alert("예측 API 오류가 발생했습니다.");
      return;
    }

    const data = await response.json();
    const results = data.results;

    if (!results || results.length === 0) {
      alert("결과 없음");
      return;
    }

    results.sort(
      (a, b) =>
        b.blackice_probability_percent -
        a.blackice_probability_percent
    );

    updateCards(results[0]);
    updateMap(results);
    updateChart(results);
    updateTable(results);

  } catch (error) {
    console.error("예측 요청 실패:", error);
    alert("예측 요청에 실패했습니다.");
  }
}

function updateCards(result) {
  document.getElementById("mainRisk").innerText =
    Number(result.blackice_probability_percent).toFixed(1) + "%";

  document.getElementById("icingProb").innerText =
    Number(result.icing_probability_percent).toFixed(1) + "%";

  document.getElementById("temp").innerText =
    result.기온 + "℃";

  document.getElementById("humidity").innerText =
    result.습도 + "%";

  document.getElementById("wind").innerText =
    result.풍속 + "m/s";

  document.getElementById("riskLevel").innerText =
    result.risk_level;
}

function getRiskColor(level) {
  if (level === "매우 위험") return "#ff3b30";
  if (level === "위험") return "#ff9500";
  if (level === "주의") return "#ffcc00";
  return "#007aff";
}

function updateMap(results) {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];

  results.forEach((r) => {
    const lat = Number(r["위도"]);
    const lon = Number(r["경도"]);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return;
    }

    const color = getRiskColor(r.risk_level);

    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      color: color,
      fillColor: color,
      fillOpacity: 0.85
    })
      .addTo(map)
      .bindPopup(`
        <b>${r.시도 || ""} ${r.시군구 || ""}</b><br>
        위험도: ${Number(r.blackice_probability_percent).toFixed(1)}%<br>
        결빙확률: ${Number(r.icing_probability_percent).toFixed(1)}%<br>
        기온: ${r.기온}℃
      `);

    markers.push(marker);
  });

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  }
}

function updateChart(results) {
  const top = results.slice(0, 7);

  riskChart.data.labels = top.map((r, i) =>
    r.읍면동 ? r.읍면동 : `지점 ${i + 1}`
  );

  riskChart.data.datasets[0].data = top.map((r) =>
    Number(r.blackice_probability_percent).toFixed(1)
  );

  riskChart.update();
}

function updateTable(results) {
  const tbody = document.getElementById("resultTable");
  tbody.innerHTML = "";

  results.slice(0, 10).forEach((r, i) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${r.시도 || "-"}</td>
      <td>${r.시군구 || "-"}</td>
      <td>${Number(r.blackice_probability_percent).toFixed(1)}%</td>
      <td>${Number(r.icing_probability_percent).toFixed(1)}%</td>
    `;

    tbody.appendChild(row);
  });
}
