# Job Applier — AI-Powered Job Fit & Outreach Engine

A self-hosted Flask app that:

1. **Analyzes** any job description and gives you a fit score plus a 5-card breakdown (sponsorship, experience, technical, domain, location/pay).
2. **Recommends** which of *your own* resume variants to send for that job.
3. **Drafts** a tailored cover letter, LinkedIn connection note, and outreach email — aligned to whichever resume you choose to send.
4. **Sends** the email immediately or schedules it for the next morning, with a built-in tracker.
5. **Recalls** prior applications via a follow-up assistant.

It runs locally, calls the AI providers *you* configure (Groq, Cerebras, Gemini, GitHub Models, Ollama — whichever keys you have), and keeps your personal data on your machine.

---

## Why a Public Template?

This repo is a **reusable template**. Everything that used to be hardcoded — the candidate identity, the resume variants, the achievements cited in prompts — has been moved into JSON config files that you create from `*.example.json` templates. Drop in your own profile, your own resume PDFs, and your own `.env`, and the app immediately becomes *your* outreach engine.

No personal data ships in the repo. Real identities, secrets, runtime CSVs, and resume PDFs are all gitignored.

---

## Quickstart

### 1. Clone and create your virtualenv

```bash
git clone <your-fork-url> job-applier
cd job-applier
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Copy the example configs

```bash
cp .env.example                            .env
cp config/profile.example.json             config/profile.json
cp config/resume_personas.example.json     config/resume_personas.json
cp config/app_settings.example.json        config/app_settings.json
```

### 3. Fill in your details

- **`.env`** — add API keys for whichever AI providers you have (you only need ONE), and your Gmail App Password if you want the email-send feature.
- **`config/profile.json`** — your name, education, location, links, achievements, voice rules. The AI cites these verbatim.
- **`config/resume_personas.json`** — one block per resume variant you keep in `resumes/`. Each block has a code (e.g. `DA`), a label, the PDF filename, and the JD triggers that should pick it.
- **`config/app_settings.json`** — feature flags, UI text, limits.

### 4. Add your resume PDFs

Drop your PDFs into `resumes/` with filenames that match the `filename` fields in `config/resume_personas.json`. The example expects:

```
resumes/data_analyst_resume.pdf
resumes/business_analyst_resume.pdf
resumes/data_scientist_resume.pdf
resumes/ai_professional_resume.pdf
```

You can rename / add / remove PDFs — just keep `resume_personas.json` in sync.

### 5. Run

```bash
python app.py
```

Open <http://localhost:5001>.

(macOS users: you can also double-click `Start_Server.command`.)

---

## Configuration Deep Dive

### `config/profile.json`

```json
{
  "candidate": {
    "full_name": "Jane Doe",
    "preferred_name": "Jane",
    "headline": "MS Business Analytics candidate focused on Python + SQL pipelines",
    "location": "Boston, MA",
    "open_to_relocation": true,
    "work_authorization": "US Citizen.",
    "links": { "portfolio": "...", "linkedin": "...", "github": "" },
    "signoff_name": "Jane Doe"
  },
  "education": [
    { "level": "graduate", "degree": "MS in Analytics", "institution": "X University", "graduation": "Jun 2026", "gpa": "3.9" }
  ],
  "achievements": [
    { "label": "Pipeline win", "description": "Cut ETL latency 60% on 250K daily records.", "tags": ["data", "etl"] }
  ],
  "ai_tools_experience": { "has_experience": false }
}
```

Optional fields:

- `education[].exact_phrasing_required` — a free-text rule (e.g. `'NEVER substitute "Computer Engineering" for "Computer Applications"'`). The app extracts quoted phrases as defensive regex patches.
- `voice.banned_phrases` — list of phrases the model is told never to use.
- `voice.signature_phrases` — list of natural-sounding phrases the model can lean on.
- `ai_tools_experience.has_experience` — set to `true` to let the model cite AI/LLM facts when a JD mentions LLMs/agents/etc.
- `networking.enable_alumni_search` + `alumni_school_slug` + `alumni_button_label` — turns on a "find alumni at this company" LinkedIn shortcut.
- `sponsorship_baseline` and `experience_baseline` — short paragraphs the analyzer uses when grading sponsorship/seniority risk.

### `config/resume_personas.json`

```json
{
  "default_code": "DA",
  "personas": [
    {
      "code": "DA",
      "label": "Data Analyst",
      "filename": "data_analyst_resume.pdf",
      "persona_voice": "Data Architect & Automation Specialist",
      "core_stack": ["SQL", "Python", "Snowflake"],
      "lead_metrics": "250K daily records; 60% latency cut.",
      "rationale_fallback": "Best fit for SQL + ETL roles.",
      "triggers": ["data analyst", "ETL", "Snowflake", "pipeline"]
    }
  ],
  "selection_priority": ["AI", "DS", "DA", "BA"]
}
```

Add as many personas as you have resumes. The triggers control which one the analyzer picks for a given JD; `selection_priority` breaks ties when multiple personas match.

### `config/app_settings.json`

```json
{
  "features": {
    "enable_followup_agent": true,
    "enable_email_sending": true,
    "enable_email_scheduling": true,
    "enable_alumni_search_button": false
  },
  "ui": {
    "app_title": "Career Command Center",
    "app_subtitle": "AI-Powered Job Fit & Outreach Engine",
    "default_email_send_time_hour_local": 8
  },
  "limits": {
    "daily_analyze_soft_cap": 30,
    "daily_analyze_hard_cap": 45,
    "connection_note_max_chars": 300,
    "email_body_min_words": 140,
    "email_body_max_words": 230,
    "cover_letter_min_words": 320,
    "cover_letter_max_words": 450
  },
  "scheduler": {
    "poll_seconds": 20,
    "send_at_hour_local": 8
  }
}
```

### `.env`

Only the AI provider keys you actually want to use need values. The provider chain `TASK_CHAIN_*` walks each task's chain in order; providers without keys are skipped automatically.

For email sending, generate a Gmail [App Password](https://support.google.com/accounts/answer/185833) — never your real account password.

---

## AI Provider Setup

You need at least one. All are free-tier friendly.

| Provider | Speed | Sign-up |
|---|---|---|
| **Groq** | Fastest | <https://console.groq.com> |
| **Cerebras** | Very fast | <https://cloud.cerebras.ai> |
| **Google Gemini** | Solid quality | <https://aistudio.google.com/app/apikey> |
| **GitHub Models** | OK | PAT with `models:read` at <https://github.com/settings/tokens> |
| **Ollama** | Local fallback | <https://ollama.com> |

The app walks the chain top-to-bottom for each task. If a provider 401s, 429s, or times out, it parks that provider and tries the next one. You can reset the breaker via the UI ("Provider health" pill).

---

## What's Where

```
.
├── app.py                          # Flask routes, AI provider chain, scheduler
├── config_loader.py                # Profile / persona / settings loaders
├── send_email.py                   # SMTP sender (Gmail App Password)
├── log_job.py                      # Tracker CSV writer
├── config/
│   ├── *.example.json              # Templates (committed)
│   └── *.json                      # YOUR config (gitignored)
├── resumes/
│   ├── README.md                   # Drop your PDFs here
│   └── *.pdf                       # YOUR resumes (gitignored)
├── data/
│   ├── README.md
│   └── *.csv / *.json              # Runtime tracker + AI usage log (gitignored)
├── templates/index.html            # Single-page UI
├── static/{script.js,style.css}    # Frontend
├── fonts/                          # Optional Noto Serif TTFs for cover-letter PDF rendering
├── .env.example                    # Template (committed)
├── .env                            # YOUR secrets (gitignored)
├── .gitignore
├── requirements.txt
└── Start_Server.command            # macOS double-click launcher
```

---

## Privacy & Safety

The following are **always gitignored** and never leave your machine:

- `.env` (API keys, Gmail credentials)
- `config/profile.json`, `config/resume_personas.json`, `config/app_settings.json`
- `resumes/*.pdf`
- `data/job_tracker.csv`, `data/ai_usage_log.csv`, `data/scheduled_emails.json`
- Generated `Cover_Letter_*.pdf` / `.docx` files

If you fork this repo and push to a public GitHub, only the example configs and the source code go up. Verify before your first push:

```bash
git status                                  # Confirm no .env / *.pdf / data/ files are staged
git ls-files | grep -E '\.env$|\.pdf$|profile\.json'
```

---

## Common Customizations

### Use only one resume

Reduce `config/resume_personas.json` to a single persona block. The Step-3 dropdown will simply have one option.

### Change the app title

Edit `config/app_settings.json` -> `ui.app_title` and `ui.app_subtitle`.

### Disable email scheduling

Set `features.enable_email_scheduling = false` in `config/app_settings.json` (the scheduling checkbox disappears from the UI).

### Disable email sending entirely

Set `features.enable_email_sending = false`. The app still drafts notes/letters and updates the tracker; the "Fire Execution" button just refuses to send.

### Add an "alumni search" button

In `config/profile.json`:

```json
"networking": {
  "enable_alumni_search": true,
  "alumni_school_slug": "your-university-linkedin-slug",
  "alumni_button_label": "MyU Alumni",
  "alumni_emoji": "🎓"
}
```

The school slug is the path segment LinkedIn uses (e.g. `https://www.linkedin.com/school/<slug>/`).

---

## Troubleshooting

- **Port 5001 in use** — set `FLASK_PORT=5002` in `.env`. macOS reserves 5000 for AirPlay, which is why we default to 5001.
- **"All AI providers are currently unavailable"** — open `.env` and confirm at least one provider key is set; the UI's "Reset breakers" button can also help if a provider was parked.
- **Cover letter says wrong degree** — add an `exact_phrasing_required` note (with the wrong variant in quotes) to that education entry; the app auto-rewrites it post-generation.
- **"PDF font registration fell back to Times-Roman"** — drop `NotoSerif-Regular.ttf` and `NotoSerif-Bold.ttf` into `fonts/` for the better serif look. Times is fine otherwise.

---

## License

MIT. See `LICENSE` if present, or add your own.
