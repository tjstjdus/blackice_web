function updateAverageCards(results) {

  if (!results || results.length === 0) {
    return;
  }

  const blackiceValues = results
    .map(r => Number(r.blackice_probability_percent))
    .filter(v => !Number.isNaN(v));

  const icingValues = results
    .map(r => Number(r.icing_probability_percent))
    .filter(v => !Number.isNaN(v));

  const tempValues = results
    .map(r => Number(r.기온))
    .filter(v => !Number.isNaN(v));

  const humidityValues = results
    .map(r => Number(r.습도))
    .filter(v => !Number.isNaN(v));

  const windValues = results
    .map(r => Number(r.풍속))
    .filter(v => !Number.isNaN(v));

  const avgBlackice =
    blackiceValues.reduce((a, b) => a + b, 0)
    / blackiceValues.length;

  const avgIcing =
    icingValues.reduce((a, b) => a + b, 0)
    / icingValues.length;

  const avgTemp =
    tempValues.length > 0
      ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length
      : null;

  const avgHumidity =
    humidityValues.length > 0
      ? humidityValues.reduce((a, b) => a + b, 0) / humidityValues.length
      : null;

  const avgWind =
    windValues.length > 0
      ? windValues.reduce((a, b) => a + b, 0) / windValues.length
      : null;

  document.getElementById("mainRisk").innerText =
    formatPercent(avgBlackice);

  document.getElementById("icingProb").innerText =
    formatPercent(avgIcing);

  document.getElementById("temp").innerText =
    formatValue(avgTemp?.toFixed(1), "℃");

  document.getElementById("humidity").innerText =
    formatValue(avgHumidity?.toFixed(1), "%");

  document.getElementById("wind").innerText =
    formatValue(avgWind?.toFixed(1), "m/s");

  document.getElementById("riskLevel").innerText =
    "지역 평균 " + getAverageRiskLevel(avgBlackice);
}
