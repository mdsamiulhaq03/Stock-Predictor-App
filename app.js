// =============================================
// CONFIGURATION
// =============================================
const ALPHA_VANTAGE_KEY = ""; // <-- Replace with your Alpha Vantage API Key
const GEMINI_API_KEY = ""; // <-- Replace with your Google Gemini API Key
const GEMINI_MODEL = "gemini-2.5-flash";

// =============================================
// UTILITY FUNCTIONS
// =============================================
const fmtPrice = (n) => `$${parseFloat(n).toFixed(2)}`;

function fmtVolume(n) {
  const v = parseInt(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toString();
}

function setSpinner(visible, label = "FETCHING DATA...") {
  const s = document.getElementById("spinner");
  const l = document.getElementById("spinnerLabel");
  if (s && l) {
    s.style.display = visible ? "flex" : "none";
    l.textContent = label;
  }
}

function showError(msg) {
  const box = document.getElementById("errorBox");
  if (box) {
    box.textContent = msg;
    box.style.display = "block";
  }
}

function clearError() {
  const box = document.getElementById("errorBox");
  if (box) box.style.display = "none";
}

function clearCards() {
  const stockCard = document.getElementById("stockCard");
  const predCard = document.getElementById("predictionCard");
  if (stockCard) stockCard.style.display = "none";
  if (predCard) predCard.style.display = "none";
}

// =============================================
// FETCH STOCK DATA (ALPHA VANTAGE)
// =============================================
async function fetchStockData(ticker) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    ticker,
  )}&apikey=${ALPHA_VANTAGE_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Network error: ${res.statusText}`);

  const json = await res.json();
  if (json["Information"]) throw new Error("Alpha Vantage rate limit reached.");
  if (json["Error Message"]) throw new Error(`Invalid ticker: ${ticker}`);

  const q = json["Global Quote"];
  if (!q || !q["05. price"]) throw new Error(`No data for: ${ticker}`);

  return {
    ticker: q["01. symbol"],
    open: q["02. open"],
    high: q["03. high"],
    low: q["04. low"],
    price: q["05. price"],
    volume: q["06. volume"],
    prevClose: q["08. previous close"],
    change: q["09. change"],
    changePct: q["10. change percent"],
    timestamp: q["07. latest trading day"],
  };
}

// =============================================
// RENDER STOCK DATA
// =============================================
function renderStockCard(data) {
  const card = document.getElementById("stockCard");
  if (!card) return;

  document.getElementById("dispTicker").textContent = data.ticker;
  document.getElementById("dispTimestamp").textContent =
    `Latest trading day: ${data.timestamp}`;
  document.getElementById("dispPrice").textContent = fmtPrice(data.price);
  document.getElementById("dispOpen").textContent = fmtPrice(data.open);
  document.getElementById("dispHigh").textContent = fmtPrice(data.high);
  document.getElementById("dispLow").textContent = fmtPrice(data.low);
  document.getElementById("dispPrevClose").textContent = fmtPrice(
    data.prevClose,
  );
  document.getElementById("dispVolume").textContent = fmtVolume(data.volume);

  const changeNum = parseFloat(data.change);
  const isPositive = changeNum >= 0;
  const changeEl = document.getElementById("dispChange");
  const changePctEl = document.getElementById("dispChangePct");
  const arrow = isPositive ? "▲" : "▼";

  changeEl.textContent = `${arrow} ${fmtPrice(Math.abs(changeNum))}`;
  changeEl.style.color = isPositive ? "green" : "red";

  changePctEl.textContent = data.changePct;
  changePctEl.style.color = isPositive ? "green" : "red";

  card.style.display = "block";
}

// =============================================
// FETCH AI PREDICTION (Google Gemini)
// =============================================
async function fetchAIPrediction(data) {
  const prompt = `
Stock: ${data.ticker}
Current Price: $${data.price}
Today's Open: $${data.open}
Today's High: $${data.high}
Today's Low: $${data.low}
Previous Close: $${data.prevClose}
Change: $${data.change} (${data.changePct})
Volume: ${data.volume}
Latest Trading Day: ${data.timestamp}

Predict if the stock price will move UP, DOWN, or NEUTRAL in the next trading session. 
Give a confidence (0-100) and short reasoning.
Respond ONLY in JSON:
{"direction":"UP or DOWN or NEUTRAL","confidence":number,"reasoning":"short explanation"}
`.trim();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      },
    );

    const dataResp = await res.json();
    const text = dataResp.candidates?.[0]?.content?.[0]?.text || "{}";
    return JSON.parse(text);
  } catch (err) {
    console.error(err);
    return {
      direction: "NEUTRAL",
      confidence: 50,
      reasoning: "No prediction available.",
    };
  }
}

// =============================================
// RENDER AI PREDICTION
// =============================================
function renderPrediction(pred) {
  const card = document.getElementById("predictionCard");
  if (!card) return;

  const arrow = document.getElementById("predArrow");
  const badge = document.getElementById("predBadge");
  const fill = document.getElementById("predConfidenceFill");
  const pct = document.getElementById("predConfidencePct");
  const reasoning = document.getElementById("predReasoning");

  const dir = (pred.direction || "NEUTRAL").toUpperCase();
  const conf = Math.min(100, Math.max(0, parseInt(pred.confidence) || 50));

  if (dir === "UP") {
    arrow.textContent = "↑";
    arrow.style.color = "green";
    badge.textContent = "▲ BULLISH — PRICE UP";
    badge.className = "verdict-badge up";
    fill.className = "confidence-fill";
  } else if (dir === "DOWN") {
    arrow.textContent = "↓";
    arrow.style.color = "red";
    badge.textContent = "▼ BEARISH — PRICE DOWN";
    badge.className = "verdict-badge down";
    fill.className = "confidence-fill down";
  } else {
    arrow.textContent = "→";
    arrow.style.color = "#f57f17";
    badge.textContent = "— NEUTRAL / SIDEWAYS";
    badge.className = "verdict-badge neutral";
    fill.className = "confidence-fill neutral";
  }

  pct.textContent = `${conf}%`;
  fill.style.width = "0%";
  setTimeout(() => (fill.style.width = `${conf}%`), 50);
  reasoning.textContent = pred.reasoning || "No reasoning provided.";

  card.style.display = "block";
}

// =============================================
// MAIN HANDLER
// =============================================
async function handleFetch() {
  const tickerInput = document.getElementById("tickerInput");
  if (!tickerInput) return;
  const ticker = tickerInput.value.trim().toUpperCase();
  if (!ticker) return showError("Enter a stock ticker symbol.");

  clearError();
  clearCards();
  setSpinner(true, "FETCHING MARKET DATA...");

  try {
    const stockData = await fetchStockData(ticker);
    renderStockCard(stockData);

    setSpinner(true, "RUNNING AI ANALYSIS...");
    const prediction = await fetchAIPrediction(stockData);
    renderPrediction(prediction);
  } catch (err) {
    showError(err.message || "Unexpected error occurred.");
  } finally {
    setSpinner(false);
  }
}

// =============================================
// EVENT LISTENERS
// =============================================
document.addEventListener("DOMContentLoaded", () => {
  const tickerInput = document.getElementById("tickerInput");
  const fetchBtn = document.getElementById("fetchBtn");

  fetchBtn.addEventListener("click", handleFetch);

  tickerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleFetch();
  });

  tickerInput.addEventListener("input", (e) => {
    const pos = e.target.selectionStart;
    e.target.value = e.target.value.toUpperCase();
    e.target.setSelectionRange(pos, pos);
  });
});
