# Local Data Directory

The app writes runtime files here. Nothing in this folder (except the README) is committed to git, so your application history stays private to your machine.

Files you might see:

- `job_tracker.csv` — every job you analyze and every email/note you send.
- `ai_usage_log.csv` — per-request telemetry for AI provider usage and quota tracking.
- `scheduled_emails.json` — queued emails waiting for their scheduled send time.

You can change the locations of these files via environment variables in `.env`:

```env
JOB_TRACKER_PATH=data/job_tracker.csv
AI_USAGE_LOG_PATH=data/ai_usage_log.csv
SCHEDULED_EMAILS_FILE=data/scheduled_emails.json
```
