import csv
import argparse
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

DEFAULT_TRACKER_PATH = os.getenv("JOB_TRACKER_PATH", "data/job_tracker.csv")


def _resolve_tracker_path(override_path=None):
    """Return the tracker path to use, ensuring its parent directory exists."""
    path = (override_path or DEFAULT_TRACKER_PATH).strip() or "data/job_tracker.csv"
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError:
            pass
    return path


def log_job(company, position, resume_used, contact_name, role, platform, message,
            status="Applied", tracker_path=None):
    path = _resolve_tracker_path(tracker_path)
    file_exists = os.path.isfile(path)

    with open(path, mode="a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        if not file_exists:
            writer.writerow([
                "Company", "Position", "Resume Used", "Contact Name", "Role",
                "Date", "Platform", "Message", "Status",
            ])

        date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        writer.writerow([
            company, position, resume_used, contact_name, role, date_str,
            platform, message, status,
        ])
        print(f"Successfully logged {position} at {company} to tracker ({path}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Log a job application.")
    parser.add_argument("--company", required=True)
    parser.add_argument("--position", required=True)
    parser.add_argument("--resume", required=True, help="Resume code (e.g., DA, BA, DS)")
    parser.add_argument("--contact", default="N/A", help="Contact Name")
    parser.add_argument("--role", default="N/A", help="Contact Role")
    parser.add_argument("--platform", default="LinkedIn", help="Platform used")
    parser.add_argument("--message", default="N/A", help="Message sent")
    parser.add_argument("--status", default="Applied", help="Current status")
    parser.add_argument("--tracker", default=None, help="Override tracker CSV path")

    args = parser.parse_args()
    log_job(
        args.company, args.position, args.resume, args.contact, args.role,
        args.platform, args.message, args.status, tracker_path=args.tracker,
    )
