# Config Directory

This folder holds the user-editable configuration that drives the app:

- `profile.example.json` — your candidate identity, achievements, links, voice rules.
- `resume_personas.example.json` — your resume variants (one per file in `resumes/`) and the JD triggers that pick each one.
- `app_settings.example.json` — feature flags, UI text, and limits.

## How to use

1. Copy each `*.example.json` file to a real one (without the `.example` suffix):
   ```bash
   cp config/profile.example.json         config/profile.json
   cp config/resume_personas.example.json config/resume_personas.json
   cp config/app_settings.example.json    config/app_settings.json
   ```
2. Open the new files and fill in your own values.
3. The app loads your real `*.json` files. The `*.example.json` versions stay in version control as a template for new users; your real ones are git-ignored so your personal info never leaks.

## Tips

- Keep your achievements specific and numeric. The model will quote whatever facts you give it.
- The triggers in `resume_personas.json` are the most important field — they decide which resume gets recommended for any given job description.
- If you only have one resume, you can keep just one persona block.
