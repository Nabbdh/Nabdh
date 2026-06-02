"""
Nabdh (نَبض) — Arabic Medical Medication Assistant
API key is loaded from .env — never hardcoded.

Setup:
  1. pip install flask flask-session werkzeug groq python-dotenv pillow
  2. cp .env.example .env
  3. Edit .env and paste your GROQ_API_KEY
  4. python app.py
"""

import os
import base64
import json
from pathlib import Path
from datetime import datetime

# ── Load .env FIRST, before reading any os.environ ──────────────────────────
# python-dotenv reads the .env file in the project root and populates
# os.environ so the rest of the code can use os.environ.get() safely.
try:
    from dotenv import load_dotenv
    load_dotenv()                          # reads .env → os.environ
    print("✅ .env loaded")
except ImportError:
    print("⚠  python-dotenv not installed — run: pip install python-dotenv")
    print("   Falling back to system environment variables only.")

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_session import Session
from werkzeug.utils import secure_filename

try:
    from groq import Groq as GroqClient
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    print("⚠  groq not installed — run: pip install groq")

from PIL import Image

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG  — all secrets come from .env, never hardcoded
# ─────────────────────────────────────────────────────────────────────────────

GROQ_API_KEY      = os.environ.get("GROQ_API_KEY", "")        # set in .env
SECRET_KEY        = os.environ.get("SECRET_KEY", "")          # set in .env

GROQ_TEXT_MODEL   = "llama-3.3-70b-versatile"
GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

MAX_UPLOAD_MB = 10
ALLOWED_EXT   = {"png", "jpg", "jpeg", "gif", "webp"}
UPLOAD_FOLDER = Path(__file__).parent / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)

# ── Validate that the key was actually loaded ────────────────────────────────
if not GROQ_API_KEY:
    print("─" * 60)
    print("❌  GROQ_API_KEY is missing.")
    print("    1. Open (or create) the file named  .env  in this folder")
    print("    2. Add this line:  GROQ_API_KEY=REMOVEDyour_real_key_here")
    print("    3. Save and restart:  python app.py")
    print("─" * 60)

if not SECRET_KEY:
    # Auto-generate a random key for dev — warn the developer
    import secrets
    SECRET_KEY = secrets.token_hex(32)
    print("⚠  SECRET_KEY not set in .env — using a random key for this session.")
    print("   Sessions will be invalidated on every restart.")
    print("   Add SECRET_KEY=<random string> to your .env to fix this.")

# ─────────────────────────────────────────────────────────────────────────────
# FLASK
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.secret_key                   = SECRET_KEY
app.config["SESSION_TYPE"]       = "filesystem"
app.config["SESSION_PERMANENT"]  = False
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
Session(app)

# ── Init Groq client ─────────────────────────────────────────────────────────
groq_client = None

if GROQ_AVAILABLE and GROQ_API_KEY:
    try:
        groq_client = GroqClient(api_key=GROQ_API_KEY)
        print(f"✅ Groq ready — text: {GROQ_TEXT_MODEL} | vision: {GROQ_VISION_MODEL}")
    except Exception as e:
        print(f"❌ Groq init error: {e}")
else:
    if GROQ_AVAILABLE:
        print("⚠  Groq library installed but GROQ_API_KEY is empty.")

# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are Nabdh (نَبض), a medical assistant specializing in medication
information for Arabic-speaking patients in the MENA region.
Your knowledge draws from PubMed, NHS, Lexicomp, and WHO guidelines.

STRICT RULES:
1. Detect the user's language (Arabic or English) and respond in that exact language.
   If only an image is provided with no text, respond in Arabic by default.
2. Respond ONLY with a single valid JSON object. Zero text before or after it. No markdown fences.
3. Use this exact schema — all keys required:
{
  "title": "Short descriptive title (5-7 words)",
  "type": "Drug Info | Interaction | Side Effects | Dosage | Prescription",
  "summary": "One clear sentence directly answering the question.",
  "points": ["Key point 1", "Key point 2", "Key point 3"],
  "details": "3-5 plain sentences of explanation. No symbols, no bullet markers.",
  "drug_info": {
    "dose": "dosage string or null",
    "route": "oral / IV / topical / etc or null",
    "frequency": "how often or null",
    "category": "drug class or null"
  },
  "warnings": "Critical warnings as plain text, or null.",
  "mena_note": "Gulf/MENA availability or regulatory note, or null.",
  "sources": ["PubMed", "NHS", "Lexicomp"]
}
4. All string values: plain sentences only — no **, no ##, no markdown.
5. Drug interactions: always state severity (major / moderate / minor).
6. If a prescription image is attached: extract ALL drug names, doses, and instructions visible.
   List each drug as a separate point. Note if handwriting is unclear.
7. Always append to warnings: "For educational purposes only — consult your physician or pharmacist."
   Arabic: "لأغراض تثقيفية فقط — استشر طبيبك أو صيدلانيك."
8. Output ONLY valid JSON."""

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


def image_to_base64(path):
    suffix = Path(path).suffix.lower().lstrip(".")
    mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
                "png": "image/png",  "gif": "image/gif", "webp": "image/webp"}
    mime = mime_map.get(suffix, "image/jpeg")
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode(), mime


def parse_json_response(raw):
    clean = raw.strip()
    for fence in ("```json", "```"):
        if fence in clean:
            clean = clean.split(fence, 1)[-1]
    if "```" in clean:
        clean = clean.split("```")[0]
    s = clean.find("{")
    e = clean.rfind("}") + 1
    if s >= 0 and e > s:
        clean = clean[s:e]
    return json.loads(clean)


def make_card(lang, title_ar, title_en, summary_ar, summary_en,
              points_ar, points_en, details, warnings_ar=None, warnings_en=None):
    if lang == "ar":
        return {
            "title":     title_ar,
            "type":      "General",
            "summary":   summary_ar,
            "points":    points_ar,
            "details":   details,
            "drug_info": {"dose": None, "route": None, "frequency": None, "category": None},
            "warnings":  warnings_ar or "لأغراض تثقيفية فقط — استشر طبيبك أو صيدلانيك.",
            "mena_note": None,
            "sources":   [],
        }
    return {
        "title":     title_en,
        "type":      "General",
        "summary":   summary_en,
        "points":    points_en,
        "details":   details,
        "drug_info": {"dose": None, "route": None, "frequency": None, "category": None},
        "warnings":  warnings_en or "For educational purposes only — consult your physician or pharmacist.",
        "mena_note": None,
        "sources":   [],
    }


def mock_card(lang):
    return make_card(
        lang,
        "مفتاح Groq غير مضبوط",
        "Groq API Key Not Configured",
        "مفتاح Groq API غير مضبوط. يرجى إضافته في ملف .env",
        "Groq API key is not set. Please add it to the .env file.",
        [
            "افتح ملف .env في مجلد المشروع",
            "أضف السطر التالي: GROQ_API_KEY=REMOVEDمفتاحك_هنا",
            "احصل على مفتاح مجاني من console.groq.com",
            "احفظ وأعد التشغيل: python app.py",
        ],
        [
            "Open the .env file in the project folder",
            "Add this line: GROQ_API_KEY=REMOVEDyour_key_here",
            "Get a free key at console.groq.com",
            "Save and restart: python app.py",
        ],
        "The .env file keeps your API key out of your code and off GitHub.",
    )


def error_card(lang, detail):
    return make_card(
        lang,
        "تعذّر معالجة الطلب",
        "Request Failed",
        "حدث خطأ أثناء المعالجة.",
        "An error occurred while processing.",
        [detail[:200]],
        [detail[:200]],
        detail[:400],
    )


# ─────────────────────────────────────────────────────────────────────────────
# GROQ CALLERS
# ─────────────────────────────────────────────────────────────────────────────

def call_groq_text(message, lang):
    resp = groq_client.chat.completions.create(
        model=GROQ_TEXT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": message},
        ],
        temperature=0.15,
        max_tokens=900,
        response_format={"type": "json_object"},
    )
    return parse_json_response(resp.choices[0].message.content)


def call_groq_vision(message, img_path, lang):
    b64, mime = image_to_base64(img_path)

    text_part = message if message else (
        "حلّل هذه الصورة واستخرج جميع أسماء الأدوية والجرعات والتعليمات الموجودة فيها. أجب بصيغة JSON فقط."
        if lang == "ar" else
        "Analyze this image and extract all drug names, doses, and instructions. Reply in JSON format only."
    )

    resp = groq_client.chat.completions.create(
        model=GROQ_VISION_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    {"type": "text",      "text": text_part},
                ],
            },
        ],
        temperature=0.15,
        max_tokens=900,
    )
    return parse_json_response(resp.choices[0].message.content)


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/generate", methods=["POST"])
def generate():
    # Parse request
    ct = request.content_type or ""
    if "multipart" in ct:
        query      = (request.form.get("query") or "").strip()
        lang       = request.form.get("lang", "ar")
        image_file = request.files.get("image")
    else:
        data       = request.get_json(force=True, silent=True) or {}
        query      = (data.get("query") or data.get("prompt") or "").strip()
        lang       = data.get("lang", "ar")
        image_file = None

    if not query and not image_file:
        return jsonify({"error": "query or image required"}), 400

    # No API key → show setup instructions
    if not groq_client:
        return jsonify({"success": True, "data": mock_card(lang), "mode": "mock"})

    # Save uploaded image
    img_path = None
    if image_file and image_file.filename and allowed_file(image_file.filename):
        fname    = secure_filename(
            f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{image_file.filename}"
        )
        img_path = UPLOAD_FOLDER / fname
        image_file.save(img_path)

    # Vision path
    if img_path:
        try:
            result = call_groq_vision(query, img_path, lang)
            return jsonify({"success": True, "data": result, "mode": "groq-vision"})
        except Exception as e:
            app.logger.error(f"Groq vision error: {e}")
            return jsonify({"success": True, "data": error_card(lang, str(e)), "mode": "error"})

    # Text path
    try:
        result = call_groq_text(query, lang)
        return jsonify({"success": True, "data": result, "mode": "groq"})
    except Exception as e:
        app.logger.error(f"Groq text error: {e}")
        return jsonify({"success": True, "data": error_card(lang, str(e)), "mode": "error"})


@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/health")
def health():
    return jsonify({
        "status":       "ok",
        "groq_ready":   groq_client is not None,
        "text_model":   GROQ_TEXT_MODEL,
        "vision_model": GROQ_VISION_MODEL,
        "provider":     "groq" if groq_client else "mock",
    })


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False,
        threaded=True,
    )