let map;
let markers = [];
let riskChart;

const API_URL = "https://blackice-server-prjr.onrender.com/predict";

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initChart();
});

function initMap() {
  map = L.map("map").setView([36.5, 127.8], 7);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap"
  }).addTo(map);
}

function initChart() {
  const ctx = document.getElementById("riskChart");

  riskChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["-"],
      datasets: [
        {
          label: "블랙아이스 사고위험도(%)",
          data: [0],
          borderRadius: 10
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
  const region = document.getElementById("region").value;

  if (!date || !time) {
    alert("날짜와 시간을 선택해주세요.");
    return;
  }

  document.body.classList.add("loading");
  document.getElementById("riskLevel").innerText = "예측 중...";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: date,
        time: time,
        max_points: 30
      })
    });

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      alert("예측 결과가 없습니다.");
      return;
    }

    let results = filterByRegion(data.results, region);

    if (results.length === 0) {
      results = data.results;
    }

    results.sort(
      (a, b) => b.blackice_probability_percent - a.blackice_probability_percent
    );

    const top = results[0];

    updateCards(top);
    updateMap(results);
    updateChart(results.slice(0, 7));
    updateTable(results.slice(0, 7));
  } catch (error) {
    console.error(error);
    alert("예측 중 오류가 발생했습니다. Render 서버 상태를 확인해주세요.");
  } finally {
    document.body.classList.remove("loading");
  }
}

function filterByRegion(results, region) {
  if (region === "all") return results;

  return results.filter((r) => {
    const lat = Number(r["위도"]);
    const lon = Number(r["경도"]);

    if (region === "gangneung") {
      return lat >= 37.3 && lat <= 38.1 && lon >= 128.3 && lon <= 129.3;
    }

    if (region === "seoul") {
      return lat >= 37.0 && lat <= 38.0 && lon >= 126.3 && lon <= 127.6;
    }

    if (region === "busan") {
      return lat >= 34.8 && lat <= 35.5 && lon >= 128.7 && lon <= 129.5;
    }

    return true;
  });
}

function updateCards(result) {
  const icing = Number(result.icing_probability_percent || 0);
  const accident = Number(result.blackice_probability_percent || 0);
  const riskLevel = result.risk_level || "-";

  document.getElementById("icingProb").innerText = icing.toFixed(1) + "%";
  document.getElementById("accidentProb").innerText = accident.toFixed(1) + "%";
  document.getElementById("temp").innerText = result["기온"] + "℃";
  document.getElementById("humidity").innerText = result["습도"] + "%";
  document.getElementById("wind").innerText = result["풍속"] + "m/s";
  document.getElementById("riskLevel").innerText = riskLevel;

  const riskCard = document.getElementById("riskCard");

  if (riskLevel === "매우 위험") {
    riskCard.style.background = "#3a0d0d";
  } else if (riskLevel === "위험") {
    riskCard.style.background = "#3a220d";
  } else if (riskLevel === "주의") {
    riskCard.style.background = "#2f2b10";
  } else {
    riskCard.style.background = "#1d1d1f";
  }
}

function getRiskColor(level) {
  if (level === "매우 위험") return "#ff3b30";
  if (level === "위험") return "#ff9500";
  if (level === "주의") return "#ffcc00";
  return "#007aff";
}

function updateMap(results) {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];

  results.forEach((r) => {
    const lat = Number(r["위도"]);
    const lon = Number(r["경도"]);

    if (Number.isNaN(lat) || Number.isNaN(lon)) return;

    const color = getRiskColor(r.risk_level);

    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      color: color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2
    })
      .addTo(map)
      .bindPopup(`
        <b>블랙아이스 위험도</b><br>
        사고위험도: ${Number(r.blackice_probability_percent).toFixed(1)}%<br>
        결빙확률: ${Number(r.icing_probability_percent).toFixed(1)}%<br>
        기온: ${r["기온"]}℃<br>
        습도: ${r["습도"]}%<br>
        등급: ${r.risk_level}
      `);

    markers.push(marker);
  });

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  }
}

function updateChart(results) {
  const labels = results.map((_, i) => `지점 ${i + 1}`);
  const values = results.map((r) =>
    Number(r.blackice_probability_percent || 0).toFixed(1)
  );

  riskChart.data.labels = labels;
  riskChart.data.datasets[0].data = values;
  riskChart.update();
}

function updateTable(results) {
  const tbody = document.getElementById("resultTable");
  tbody.innerHTML = "";

  results.forEach((r, i) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${Number(r["위도"]).toFixed(5)}</td>
      <td>${Number(r["경도"]).toFixed(5)}</td>
      <td>${Number(r.icing_probability_percent).toFixed(1)}%</td>
      <td>${Number(r.blackice_probability_percent).toFixed(1)}%</td>
      <td>${r.risk_level}</td>
    `;

    tbody.appendChild(row);
  });
}
