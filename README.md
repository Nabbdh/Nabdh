# نَبض · Nabdh — Arabic Medical Pharmacy Assistant

> AI-powered medication information for Arabic-speaking patients in the MENA region

## What it does
Nabdh answers medication questions for Arabic-speaking patients — dosages,
side effects, drug interactions, and prescription image analysis — with
answers grounded in PubMed, NHS, and Lexicomp.

## Features
- 💊 Medication info · dosages · side effects · drug interactions
- 📷 Prescription image analysis (upload photo or use camera)
- 🌍 Arabic-first UI with English toggle (full RTL support)
- ⚕️ MENA/Gulf-specific clinical notes
- 🔒 Secure API key handling via `.env`

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Python · Flask |
| AI (text) | Groq · Llama 3.3 70B |
| AI (vision) | Groq · Llama 4 Scout 17B |
| Frontend | HTML · CSS · Vanilla JS |
| Language | Arabic (RTL) · English |

## Setup
\`\`\`bash
git clone https://github.com/Nabbdh/Nabdh.git
cd Nabdh
pip install -r requirment.txt
cp .env.example .env
# Open .env and add your GROQ_API_KEY
python app.py
\`\`\`

## Environment Variables
| Variable | Where to get it |
|----------|----------------|
| `GROQ_API_KEY` | Free at [console.groq.com](https://console.groq.com) |
| `SECRET_KEY` | Any random string |

## Screenshots
![Nabdh Interface](screenshots/)

---
> ⚕️ For educational purposes only — not a substitute for professional medical advice.
