async function predictRisk() {

  const date = document.getElementById("date").value;
  const time = document.getElementById("time").value;

  if (!date || !time) {
    alert("날짜와 시간을 입력하세요.");
    return;
  }

  const response = await fetch(
    "https://blackice-server-prjr.onrender.com/predict",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: date,
        time: time,
        max_points: 3
      })
    }
  );

  const data = await response.json();

  const result = data.results[0];

  document.getElementById("icingProb").innerText =
    result.icing_probability_percent.toFixed(1) + "%";

  document.getElementById("accidentProb").innerText =
    result.blackice_probability_percent.toFixed(1) + "%";

  document.getElementById("temp").innerText =
    result.기온 + "℃";

  document.getElementById("humidity").innerText =
    result.습도 + "%";

  document.getElementById("wind").innerText =
    result.풍속 + "m/s";
}