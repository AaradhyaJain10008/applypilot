# Resume PDFs

Drop your own resume PDFs into this directory. Each filename should match a `filename` field in `config/resume_personas.json`.

For the default example personas, the app expects files like:

- `resumes/data_analyst_resume.pdf`
- `resumes/business_analyst_resume.pdf`
- `resumes/data_scientist_resume.pdf`
- `resumes/ai_professional_resume.pdf`

You can rename, add, or remove these — just keep `config/resume_personas.json` in sync with whatever files you actually keep here.

## Privacy note

PDF files in this folder are listed in `.gitignore`, so they will never be committed to git accidentally. Only this README is tracked.

If you only use one resume, simply keep one PDF here and reduce `config/resume_personas.json` to a single persona block.
