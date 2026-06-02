/**
 * Nabdh (نَبض) — app.js
 * Handles: language switching, image upload, Flask API calls, result rendering
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let currentLang   = "ar";
let pendingImages = [];     // Array of { file: File, previewUrl: string }
let isLoading     = false;

// ─────────────────────────────────────────────────────────────────────────────
// UI STRINGS
// ─────────────────────────────────────────────────────────────────────────────

const UI = {
  ar: {
    eyebrow:      "مساعد أبحاث الصيدلة في الوطن العربي",
    h1:           'ابحث في نبض <em>طب العالم العربي</em>',
    sub:          "اسأل أي سؤال دوائي — احصل على إجابات مستندة إلى PubMed و NHS و Lexicomp.",
    placeholder:  "مثال: جرعة الأموكسيسيلين للأطفال، أو تفاعل الميتفورمين مع الإيبوبروفين...",
    searchBtn:    "ابحث في نَبض",
    loading:      "جارٍ البحث في المصادر الطبية...",
    aiLabel:      "ملخص الذكاء الاصطناعي",
    disclaimer:   "هذه المعلومات لأغراض التثقيف فقط — استشر طبيبك أو صيدلانيك قبل أي قرار علاجي.",
    error:        "حدث خطأ. تأكد من الاتصال وحاول مجدداً.",
    lblSummary:   "الجواب المباشر",
    lblPoints:    "النقاط الرئيسية",
    lblDetails:   "الشرح التفصيلي",
    lblDrug:      "معلومات الدواء",
    lblWarn:      "تحذيرات",
    lblMena:      "ملاحظة MENA",
    dose:         "الجرعة",
    route:        "طريقة الإعطاء",
    frequency:    "التكرار",
    category:     "الفئة الدوائية",
    chips: [
      { en: "All MENA",       ar: "كل المنطقة" },
      { en: "UAE",            ar: "الإمارات" },
      { en: "Saudi Arabia",   ar: "السعودية" },
      { en: "Egypt",          ar: "مصر" },
      { en: "Jordan",         ar: "الأردن" },
      { en: "Diabetes",       ar: "السكري" },
      { en: "Cardiovascular", ar: "القلب" },
      { en: "Oncology",       ar: "الأورام" },
    ],
  },
  en: {
    eyebrow:      "MENA Pharmacy Research Assistant",
    h1:           'Research the pulse of <em>Arab world medicine</em>',
    sub:          "Ask any pharmacy or drug question — get AI-powered answers grounded in PubMed, NHS & Lexicomp.",
    placeholder:  "e.g. Amoxicillin dose for children, or Metformin interaction with Ibuprofen...",
    searchBtn:    "Search نَبض",
    loading:      "Searching medical sources...",
    aiLabel:      "AI Summary",
    disclaimer:   "This information is for educational purposes only — consult a physician or pharmacist before any treatment decision.",
    error:        "Something went wrong. Check your connection and try again.",
    lblSummary:   "Direct Answer",
    lblPoints:    "Key Points",
    lblDetails:   "Detailed Explanation",
    lblDrug:      "Drug Information",
    lblWarn:      "Warnings",
    lblMena:      "MENA Note",
    dose:         "Dose",
    route:        "Route",
    frequency:    "Frequency",
    category:     "Drug Class",
  },
};

const t = (key) => UI[currentLang][key] || key;

// Tag colour mapping by result type
const TYPE_TAG = {
  "Drug Info":    "tag-green",
  "Interaction":  "tag-amber",
  "Side Effects": "tag-red",
  "Dosage":       "tag-blue",
  "Prescription": "tag-purple",
  "General":      "tag-green",
};

// Source badge CSS class mapping
const BADGE_CSS = {
  "PubMed":    "src-pubmed",
  "NHS":       "src-nhs",
  "Lexicomp":  "src-lexi",
  "WHO EMRO":  "src-who",
  "WHO":       "src-who",
};


// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE SWITCHING
// ─────────────────────────────────────────────────────────────────────────────

function setLang(lang) {
  currentLang = lang;
  const isAr = lang === "ar";

  document.documentElement.lang = lang;
  document.body.classList.toggle("ltr", !isAr);
  document.body.dir = isAr ? "rtl" : "ltr";

  document.getElementById("btn-ar").classList.toggle("active",  isAr);
  document.getElementById("btn-en").classList.toggle("active", !isAr);

  // Update text nodes
  document.getElementById("hero-eyebrow").textContent = t("eyebrow");
  document.getElementById("hero-h1").innerHTML        = t("h1");
  document.getElementById("hero-sub").textContent     = t("sub");
  document.getElementById("search-input").placeholder = t("placeholder");
  document.getElementById("search-btn").textContent   = t("searchBtn");
  document.getElementById("loading-text").textContent = t("loading");
  document.getElementById("ai-summary-label").textContent = t("aiLabel");
  document.getElementById("disclaimer-text").textContent  = t("disclaimer");

  // Update filter chips
  document.querySelectorAll(".filter-chip[data-en]").forEach(chip => {
    chip.textContent = isAr ? chip.dataset.ar : chip.dataset.en;
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// FILTER CHIPS
// ─────────────────────────────────────────────────────────────────────────────

function toggleChip(btn) {
  btn.classList.toggle("active");
}

function getActiveFilters() {
  return [...document.querySelectorAll(".filter-chip.active")]
    .map(b => b.dataset.en || b.textContent.trim())
    .join(", ");
}


// ─────────────────────────────────────────────────────────────────────────────
// IMAGE HANDLING
// ─────────────────────────────────────────────────────────────────────────────

function triggerUpload()  { document.getElementById("file-input").click(); }
function triggerCamera()  { document.getElementById("cam-input").click(); }

function handleFiles(e) {
  Array.from(e.target.files).forEach(file => {
    const url = URL.createObjectURL(file);
    pendingImages.push({ file, previewUrl: url });
  });
  e.target.value = "";
  renderStrip();
}

function removeImage(idx) {
  URL.revokeObjectURL(pendingImages[idx].previewUrl);
  pendingImages.splice(idx, 1);
  renderStrip();
}

function renderStrip() {
  const strip   = document.getElementById("img-strip");
  const attachBtn = document.getElementById("attach-btn");
  const badge   = attachBtn.querySelector(".img-count");

  strip.innerHTML = "";
  pendingImages.forEach((img, i) => {
    const wrap = document.createElement("div");
    wrap.className = "img-thumb";
    wrap.innerHTML = `
      <img src="${img.previewUrl}" alt="preview" />
      <button class="img-thumb-x" onclick="removeImage(${i})" aria-label="Remove">×</button>`;
    strip.appendChild(wrap);
  });

  strip.classList.toggle("show", pendingImages.length > 0);
  attachBtn.classList.toggle("active", pendingImages.length > 0);
  if (badge) badge.textContent = pendingImages.length;
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function show(id) { document.getElementById(id).style.display = "block"; }
function hide(id) { document.getElementById(id).style.display = "none"; }


// ─────────────────────────────────────────────────────────────────────────────
// CARD RENDERER
// ─────────────────────────────────────────────────────────────────────────────

function buildCard(p) {
  const typeTag  = TYPE_TAG[p.type] || "tag-green";
  const srcBadges = (p.sources || [])
    .map(s => `<span class="foot-badge src-badge ${BADGE_CSS[s] || "src-who"}">${esc(s)}</span>`)
    .join("");

  let html = `<div class="result-card" style="display:block">`;

  /* ── Card header ── */
  html += `
    <div class="card-header">
      <div class="card-title-row">
        <div class="card-title">${esc(p.title || t("lblSummary"))}</div>
        <div class="card-tags">
          <span class="tag ${typeTag}">${esc(p.type || "")}</span>
        </div>
      </div>
    </div>`;

  /* ── Summary ── */
  if (p.summary) {
    html += `
      <div class="card-section">
        <div class="section-label">💊 ${t("lblSummary")}</div>
        <div class="section-body"><p>${esc(p.summary)}</p></div>
      </div>`;
  }

  /* ── Key points ── */
  if (p.points && p.points.length) {
    const lis = p.points.map(pt => `<li>${esc(pt)}</li>`).join("");
    html += `
      <div class="card-section">
        <div class="section-label">📋 ${t("lblPoints")}</div>
        <div class="section-body"><ul>${lis}</ul></div>
      </div>`;
  }

  /* ── Details ── */
  if (p.details) {
    const paras = p.details
      .split(/\n+/)
      .filter(Boolean)
      .map(l => `<p>${esc(l)}</p>`)
      .join("");
    html += `
      <div class="card-section">
        <div class="section-label">📖 ${t("lblDetails")}</div>
        <div class="section-body">${paras}</div>
      </div>`;
  }

  /* ── Drug info grid ── */
  const di = p.drug_info;
  if (di && (di.dose || di.route || di.frequency || di.category)) {
    let cells = "";
    if (di.dose)      cells += `<div class="drug-cell"><div class="drug-cell-lbl">${t("dose")}</div><div class="drug-cell-val">${esc(di.dose)}</div></div>`;
    if (di.route)     cells += `<div class="drug-cell"><div class="drug-cell-lbl">${t("route")}</div><div class="drug-cell-val">${esc(di.route)}</div></div>`;
    if (di.frequency) cells += `<div class="drug-cell"><div class="drug-cell-lbl">${t("frequency")}</div><div class="drug-cell-val">${esc(di.frequency)}</div></div>`;
    if (di.category)  cells += `<div class="drug-cell"><div class="drug-cell-lbl">${t("category")}</div><div class="drug-cell-val">${esc(di.category)}</div></div>`;
    html += `
      <div class="card-section">
        <div class="section-label">💉 ${t("lblDrug")}</div>
        <div class="drug-grid">${cells}</div>
      </div>`;
  }

  /* ── Warnings ── */
  if (p.warnings) {
    html += `
      <div class="card-section">
        <div class="section-label">⚠️ ${t("lblWarn")}</div>
        <div class="warn-box"><span class="warn-icon">⚠️</span><span>${esc(p.warnings)}</span></div>
      </div>`;
  }

  /* ── MENA note ── */
  if (p.mena_note) {
    html += `
      <div class="card-section">
        <div class="section-label">🌍 ${t("lblMena")}</div>
        <div class="mena-box">🌍 ${esc(p.mena_note)}</div>
      </div>`;
  }

  /* ── Source footer ── */
  if (srcBadges) {
    html += `<div class="card-footer">${srcBadges}</div>`;
  }

  html += `</div>`;
  return html;
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN SEARCH / API CALL
// ─────────────────────────────────────────────────────────────────────────────

async function runSearch() {
  if (isLoading) return;

  const query = document.getElementById("search-input").value.trim();
  if (!query && pendingImages.length === 0) return;

  // Snapshot & clear pending images
  const imgs = [...pendingImages];
  pendingImages = [];
  renderStrip();

  isLoading = true;
  document.getElementById("search-btn").disabled = true;
  document.getElementById("result-cards").innerHTML = "";
  hide("ai-summary");
  hide("state-msg");
  show("loading");

  try {
    // Build FormData — supports both text and image(s)
    const form = new FormData();
    form.append("query", query);
    form.append("lang", currentLang);
    form.append("filters", getActiveFilters());

    imgs.forEach((img, i) => {
      form.append(i === 0 ? "image" : `image_${i}`, img.file, img.file.name);
    });

    const res  = await fetch("/generate", { method: "POST", body: form });
    const json = await res.json();

    hide("loading");

    if (!res.ok || json.error) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }

    const data = json.data;

    // AI summary banner
    if (data.summary) {
      document.getElementById("ai-summary-text").textContent = data.summary;
      show("ai-summary");
    }

    // Result card
    document.getElementById("result-cards").innerHTML = buildCard(data);

  } catch (err) {
    hide("loading");
    document.getElementById("state-msg-text").textContent =
      t("error") + (err.message ? ` — ${err.message}` : "");
    show("state-msg");
    console.error("Nabdh error:", err);
  }

  isLoading = false;
  document.getElementById("search-btn").disabled = false;
}


// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS (set up after DOM ready)
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Enter key in search input
  document.getElementById("search-input").addEventListener("keydown", e => {
    if (e.key === "Enter") runSearch();
  });

  // Default language: Arabic
  setLang("ar");
});