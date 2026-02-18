const cities = [
  { name: "日本", timezone: "Asia/Tokyo", currency: "JPY", top: 40, left: 50 },
  { name: "中国", timezone: "Asia/Shanghai", currency: "CNY", top: 24, left: 43 },
  { name: "アメリカ", timezone: "America/New_York", currency: "USD", top: 40, left: 82 },
  { name: "トルコ", timezone: "Europe/Istanbul", currency: "TRY", top: 53, left: 33 },
  { name: "オーストラリア", timezone: "Australia/Sydney", currency: "AUD", top: 74, left: 58 },
  { name: "ロンドン", timezone: "Europe/London", currency: "GBP", top: 16, left: 12 },
  { name: "ユーロ圏", timezone: "Europe/Brussels", currency: "EUR", top: 30, left: 22 }
];

const JST_TIMEZONE = "Asia/Tokyo";
const worldMap = document.getElementById("worldMap");
const cityTemplate = document.getElementById("cityTemplate");
const notice = document.getElementById("notice");

const mainDate = document.getElementById("mainDate");
const mainTime = document.getElementById("mainTime");
const mainZone = document.getElementById("mainZone");
const mainFx = document.getElementById("mainFx");

const alarmInput = document.getElementById("alarmInput");
const alarmSetBtn = document.getElementById("alarmSetBtn");
const alarmClearBtn = document.getElementById("alarmClearBtn");
const alarmStatus = document.getElementById("alarmStatus");

const timerInput = document.getElementById("timerInput");
const timerStartBtn = document.getElementById("timerStartBtn");
const timerStopBtn = document.getElementById("timerStopBtn");
const timerStatus = document.getElementById("timerStatus");
const alertCountry = document.getElementById("alertCountry");
const alertCurrentRate = document.getElementById("alertCurrentRate");
const alertDirection = document.getElementById("alertDirection");
const alertTargetRate = document.getElementById("alertTargetRate");
const alertAddBtn = document.getElementById("alertAddBtn");
const alertDeleteCheckedBtn = document.getElementById("alertDeleteCheckedBtn");
const alertNotifyBtn = document.getElementById("alertNotifyBtn");
const alertStatus = document.getElementById("alertStatus");
const alertScreen = document.getElementById("alertScreen");
const alertList = document.getElementById("alertList");
const rightFigureImg = document.getElementById("rightFigureImg");

let selectedTimezone = JST_TIMEZONE;
let selectedCityName = "日本";
let alarmTime = null;
let alarmTriggeredMinute = null;
let timerSeconds = 0;
let timerId = null;
let alertIdSequence = 1;
let alertCityName = "日本";

const cityElements = new Map();
const fxRates = new Map();
const fxAlerts = [];
const ALERT_LIMIT = 50;
const ALERT_EMAIL_TO = "b.boy4273@gmail.com";
const ALERT_STORAGE_KEY = "worldclock_fx_alerts_v1";

function formatInTimezone(date, timezone, options) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: timezone, ...options }).format(date);
}

function getOffsetMinutes(date, timezone) {
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset"
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = tzName && tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function diffFromJstHours(date, timezone) {
  const diffMin = getOffsetMinutes(date, timezone) - getOffsetMinutes(date, JST_TIMEZONE);
  return diffMin / 60;
}

function formatDiff(diffHours) {
  if (diffHours === 0) return "JST +0h";
  const sign = diffHours > 0 ? "+" : "-";
  const abs = Math.abs(diffHours);
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `JST ${sign}${text}h`;
}

function rateText(city) {
  if (city.currency === "JPY") {
    return "1 JPY = 1.000 JPY";
  }

  const rate = fxRates.get(city.currency);
  if (!rate) {
    return `1 ${city.currency} = 取得中...`;
  }

  return `1 ${city.currency} = ${rate.toFixed(3)} JPY`;
}

function setNotice(text) {
  notice.textContent = text;
}

function initRightFigureImage() {
  if (!rightFigureImg) return;

  const candidates = [
    "images/character.png",
    "images/character.jpg",
    "images/character.jpeg",
    "images/image.png",
    "images/image.jpg",
    "character.png",
    "character.jpg",
    "character.jpeg"
  ];
  let idx = 0;

  const tryNext = () => {
    if (idx >= candidates.length) {
      rightFigureImg.style.display = "none";
      setNotice("右側画像が見つかりません。WorldClock/images に character.png を置いてください。");
      return;
    }
    rightFigureImg.src = candidates[idx];
    idx += 1;
  };

  rightFigureImg.addEventListener("error", tryNext);
  rightFigureImg.addEventListener("load", () => {
    rightFigureImg.style.display = "block";
  });
  tryNext();
}

function saveAlertState() {
  const payload = {
    alertCityName,
    alertIdSequence,
    fxAlerts
  };
  localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(payload));
}

function loadAlertState() {
  const raw = localStorage.getItem(ALERT_STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.fxAlerts)) {
      fxAlerts.splice(0, fxAlerts.length, ...parsed.fxAlerts.slice(0, ALERT_LIMIT));
    }
    if (parsed && typeof parsed.alertIdSequence === "number" && parsed.alertIdSequence > 0) {
      alertIdSequence = parsed.alertIdSequence;
    } else if (fxAlerts.length > 0) {
      alertIdSequence = Math.max(...fxAlerts.map((a) => Number(a.id) || 0)) + 1;
    }
    if (parsed && typeof parsed.alertCityName === "string") {
      alertCityName = parsed.alertCityName;
    }
  } catch {
    // ignore broken saved data
  }
}

function getSelectedCity() {
  return cities.find((city) => city.name === selectedCityName) || cities[0];
}

function getCityByName(name) {
  return cities.find((city) => city.name === name) || null;
}

function getAlertCity() {
  return getCityByName(alertCityName) || getSelectedCity();
}

function getCurrentRateForCity(city) {
  if (!city) return null;
  if (city.currency === "JPY") return 1;
  const rate = fxRates.get(city.currency);
  return typeof rate === "number" ? rate : null;
}

function formatRateNumber(rate) {
  return Number(rate).toFixed(3);
}

function setSmoothedRate(currency, newValue) {
  if (typeof newValue !== "number" || !Number.isFinite(newValue) || newValue <= 0) return;
  const prev = fxRates.get(currency);
  const smooth = typeof prev === "number" ? (prev * 2 + newValue) / 3 : newValue;
  fxRates.set(currency, smooth);
}

function updateAlertForm(resetTargetRate = false) {
  const city = getAlertCity();
  const currentRate = getCurrentRateForCity(city);
  alertCountry.value = city.name;

  if (currentRate === null) {
    alertCurrentRate.value = `1 ${city.currency} = 取得中...`;
    if (resetTargetRate) alertTargetRate.value = "";
    return;
  }

  alertCurrentRate.value = `1 ${city.currency} = ${formatRateNumber(currentRate)} JPY`;
  if (resetTargetRate || !alertTargetRate.value) {
    alertTargetRate.value = formatRateNumber(currentRate);
  }
}

function syncAlertCountrySelect() {
  alertCountry.innerHTML = "";
  cities.forEach((city) => {
    const option = document.createElement("option");
    option.value = city.name;
    option.textContent = city.name;
    alertCountry.appendChild(option);
  });
  if (!getCityByName(alertCityName)) {
    alertCityName = cities[0].name;
  }
  alertCountry.value = alertCityName;
}

function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    setNotice("このブラウザは通知に対応していません");
    return;
  }

  Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      setNotice("ブラウザ通知を許可しました");
    } else {
      setNotice("ブラウザ通知が拒否されました");
    }
  });
}

function showBrowserNotification(text) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("WorldClock 為替アラート", { body: text });
  }
}

function playFxAlertWarningSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const pattern = [0, 0.22, 0.44, 0.66, 0.88];

  pattern.forEach((start, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = index % 2 === 0 ? 920 : 740;
    gain.gain.value = 0.001;
    gain.gain.setValueAtTime(0.001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.085, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + 0.2);
  });

  setTimeout(() => {
    ctx.close();
  }, 1500);
}

function openMailDraft(text) {
  const subject = encodeURIComponent("WorldClock 為替アラート通知");
  const body = encodeURIComponent(`${text}\n\n送信先: ${ALERT_EMAIL_TO}`);
  const link = `mailto:${ALERT_EMAIL_TO}?subject=${subject}&body=${body}`;
  const anchor = document.createElement("a");
  anchor.href = link;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function pushLiveAlert(text, alertId = null) {
  const box = document.createElement("div");
  box.className = "live-alert";

  const message = document.createElement("span");
  message.textContent = text;
  box.appendChild(message);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ghost";
  closeBtn.textContent = "閉じる";
  closeBtn.addEventListener("click", () => {
    if (typeof alertId === "number") {
      removeAlertById(alertId);
    }
    box.remove();
  });
  box.appendChild(closeBtn);

  alertScreen.prepend(box);
}

function updateAlertStatus() {
  alertStatus.textContent = `予約: ${fxAlerts.length} / ${ALERT_LIMIT}`;
}

function removeAlertById(id) {
  const idx = fxAlerts.findIndex((alert) => alert.id === id);
  if (idx >= 0) {
    fxAlerts.splice(idx, 1);
    renderAlertList();
    updateAlertStatus();
    saveAlertState();
  }
}

function renderAlertList() {
  alertList.innerHTML = "";

  if (fxAlerts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "alert-meta";
    empty.textContent = "予約はありません";
    alertList.appendChild(empty);
    return;
  }

  fxAlerts.forEach((alert) => {
    const row = document.createElement("div");
    row.className = `alert-row${alert.active ? "" : " done"}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.alertId = String(alert.id);
    row.appendChild(checkbox);

    const meta = document.createElement("div");
    meta.className = "alert-meta";
    const condition = alert.direction === "gte" ? "以上" : "以下";
    const state = alert.active ? "予約中" : alert.triggered ? "通知済み" : "キャンセル済み";
    meta.textContent =
      `#${alert.id} ${alert.cityName} / 1 ${alert.currency} ${condition} ${formatRateNumber(alert.targetRate)} JPY (${state})`;
    row.appendChild(meta);

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "ghost";
    actionBtn.textContent = alert.active ? "解除" : "削除";
    actionBtn.addEventListener("click", () => {
      if (alert.active) {
        alert.active = false;
        alert.triggered = false;
        setNotice(`予約解除: #${alert.id}`);
        renderAlertList();
        saveAlertState();
      } else {
        removeAlertById(alert.id);
      }
    });
    row.appendChild(actionBtn);

    alertList.appendChild(row);
  });
}

function addFxAlert() {
  if (fxAlerts.length >= ALERT_LIMIT) {
    setNotice(`予約は最大${ALERT_LIMIT}件です`);
    return;
  }

  const city = getAlertCity();
  const target = Number(alertTargetRate.value);
  if (!Number.isFinite(target) || target <= 0) {
    setNotice("通知レートを正しく入力してください");
    return;
  }

  fxAlerts.push({
    id: alertIdSequence++,
    cityName: city.name,
    currency: city.currency,
    direction: alertDirection.value,
    targetRate: target,
    active: true,
    triggered: false
  });

  updateAlertStatus();
  renderAlertList();
  setNotice(`予約追加: ${city.name} ${formatRateNumber(target)} JPY`);
  saveAlertState();
}

function deleteCheckedAlerts() {
  const checked = [...alertList.querySelectorAll('input[type="checkbox"]:checked')].map((node) =>
    Number(node.dataset.alertId)
  );
  if (checked.length === 0) {
    setNotice("削除対象にチェックを入れてください");
    return;
  }

  for (let i = fxAlerts.length - 1; i >= 0; i -= 1) {
    if (checked.includes(fxAlerts[i].id)) {
      fxAlerts.splice(i, 1);
    }
  }

  updateAlertStatus();
  renderAlertList();
  setNotice(`${checked.length}件削除しました`);
  saveAlertState();
}

function evaluateFxAlerts() {
  fxAlerts.forEach((alert) => {
    if (!alert.active) return;
    const city = getCityByName(alert.cityName);
    const currentRate = getCurrentRateForCity(city);
    if (currentRate === null) return;

    const reached = alert.direction === "gte" ? currentRate >= alert.targetRate : currentRate <= alert.targetRate;
    if (!reached) return;

    alert.active = false;
    alert.triggered = true;
    const conditionText = alert.direction === "gte" ? "以上" : "以下";
    const message =
      `${alert.cityName}: 1 ${alert.currency} = ${formatRateNumber(currentRate)} JPY (${formatRateNumber(
        alert.targetRate
      )} ${conditionText})`;
    pushLiveAlert(message, alert.id);
    playFxAlertWarningSound();
    showBrowserNotification(message);
    openMailDraft(message);
    setNotice(`為替アラート発火: #${alert.id}`);
    saveAlertState();
  });

  renderAlertList();
}

function createCityClocks() {
  cities.forEach((city) => {
    const el = cityTemplate.content.firstElementChild.cloneNode(true);
    el.style.top = `${city.top}%`;
    el.style.left = `${city.left}%`;
    el.querySelector(".city-name").textContent = city.name;

    el.addEventListener("click", () => {
      selectedTimezone = city.timezone;
      selectedCityName = city.name;
      alertCityName = city.name;
      updateMainDisplay();
      refreshActiveCity();
      updateAlertForm(true);
    });

    cityElements.set(city.name, { root: el, city });
    worldMap.appendChild(el);
  });

  refreshActiveCity();
}

function refreshActiveCity() {
  cityElements.forEach(({ root, city }) => {
    root.classList.toggle("active", city.name === selectedCityName);
  });
}

function updateMainDisplay() {
  const now = new Date();
  const selectedCity = getSelectedCity();
  mainDate.textContent = formatInTimezone(now, selectedTimezone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });

  mainTime.textContent = formatInTimezone(now, selectedTimezone, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  mainZone.textContent = `${selectedTimezone} (${selectedCityName})`;
  mainFx.textContent = rateText(selectedCity);
}

function updateCityDisplays() {
  const now = new Date();

  cityElements.forEach(({ root, city }) => {
    root.querySelector(".city-time").textContent = formatInTimezone(now, city.timezone, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    const diff = diffFromJstHours(now, city.timezone);
    const diffEl = root.querySelector(".city-diff");
    diffEl.textContent = formatDiff(diff);
    diffEl.classList.remove("plus", "minus", "zero");
    diffEl.classList.add(diff > 0 ? "plus" : diff < 0 ? "minus" : "zero");

    root.querySelector(".city-rate").textContent = rateText(city);
  });
}

async function fetchRateFor(baseCurrency) {
  if (baseCurrency === "JPY") {
    setSmoothedRate("JPY", 1);
    return;
  }

  const response = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
  if (!response.ok) {
    throw new Error(`${baseCurrency}: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.rates || typeof data.rates.JPY !== "number") {
    throw new Error(`${baseCurrency}: invalid payload`);
  }
  setSmoothedRate(baseCurrency, data.rates.JPY);
}

async function refreshFxRates() {
  const uniqueCurrencies = [...new Set(cities.map((city) => city.currency))];

  try {
    await Promise.all(uniqueCurrencies.map((currency) => fetchRateFor(currency)));
    setNotice(`為替更新(API): ${new Date().toLocaleTimeString("ja-JP")}`);
  } catch (error) {
    setNotice(`為替更新エラー: ${error.message}`);
  }

  updateCityDisplays();
  updateMainDisplay();
  updateAlertForm(false);
  evaluateFxAlerts();
}

function playBeep() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = 880;
  gain.gain.value = 0.03;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}

function currentHmInSelectedTimezone() {
  const now = new Date();
  return formatInTimezone(now, selectedTimezone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function checkAlarm() {
  if (!alarmTime) return;

  const now = new Date();
  const hm = formatInTimezone(now, selectedTimezone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  if (hm === alarmTime && alarmTriggeredMinute !== hm) {
    alarmTriggeredMinute = hm;
    playBeep();
    setNotice(`アラーム: ${hm} (${selectedCityName})`);
  }
}

function setAlarm() {
  const value = alarmInput.value;
  if (!value) {
    alarmStatus.textContent = "時刻を入力してください";
    return;
  }

  alarmTime = value;
  alarmTriggeredMinute = null;
  alarmStatus.textContent = `設定済み: ${alarmTime} (${selectedCityName})`;
}

function clearAlarm() {
  alarmTime = null;
  alarmTriggeredMinute = null;
  alarmStatus.textContent = "未設定";
}

function renderTimer() {
  const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
  const s = String(timerSeconds % 60).padStart(2, "0");
  timerStatus.textContent = `${m}:${s}`;
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function startTimer() {
  const value = Number(timerInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    timerStatus.textContent = "秒数を正しく入力";
    return;
  }

  stopTimer();
  timerSeconds = Math.floor(value);
  renderTimer();

  timerId = setInterval(() => {
    timerSeconds -= 1;
    renderTimer();

    if (timerSeconds <= 0) {
      stopTimer();
      playBeep();
      setNotice("タイマー終了");
    }
  }, 1000);
}

function bindEvents() {
  alarmSetBtn.addEventListener("click", setAlarm);
  alarmClearBtn.addEventListener("click", clearAlarm);
  alarmInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") setAlarm();
  });

  timerStartBtn.addEventListener("click", startTimer);
  timerStopBtn.addEventListener("click", stopTimer);
  timerInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") startTimer();
  });

  alertAddBtn.addEventListener("click", addFxAlert);
  alertDeleteCheckedBtn.addEventListener("click", deleteCheckedAlerts);
  alertNotifyBtn.addEventListener("click", requestBrowserNotificationPermission);
  alertCountry.addEventListener("change", () => {
    alertCityName = alertCountry.value;
    updateAlertForm(true);
    saveAlertState();
  });
  alertTargetRate.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addFxAlert();
  });
}

function tick() {
  updateMainDisplay();
  updateCityDisplays();
  checkAlarm();
}

function init() {
  initRightFigureImage();
  loadAlertState();
  syncAlertCountrySelect();
  createCityClocks();
  bindEvents();
  tick();
  refreshFxRates();

  setInterval(tick, 1000);
  setInterval(refreshFxRates, 3000);

  alarmStatus.textContent = `未設定 (現在: ${currentHmInSelectedTimezone()})`;
  renderTimer();
  updateAlertForm(true);
  updateAlertStatus();
  renderAlertList();
}

init();

