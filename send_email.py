import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import os
from dotenv import load_dotenv
load_dotenv()
import argparse


def send_email(to_email, subject, body, attachment_path=None):
    """
    Send via Gmail SMTP (App Password). Recipients get the message; the sender
    account should see a copy under Gmail Sent when using these credentials.
    """
    sender_email = (os.getenv("SENDER_EMAIL") or "").strip()
    app_password = (os.getenv("EMAIL_APP_PASSWORD") or "").strip()

    if not sender_email or not app_password:
        raise RuntimeError("SENDER_EMAIL or EMAIL_APP_PASSWORD not set in environment.")

    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = to_email
    msg['Subject'] = subject

    msg.attach(MIMEText(body, 'plain', 'utf-8'))

    if attachment_path and os.path.exists(attachment_path):
        with open(attachment_path, "rb") as attachment:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(attachment.read())
        encoders.encode_base64(part)
        filename = os.path.basename(attachment_path)
        part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
        msg.attach(part)

    last_err = None
    # Try STARTTLS :587 first (most networks); fall back to SSL :465.
    for use_ssl, port in ((False, 587), (True, 465)):
        try:
            if use_ssl:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL('smtp.gmail.com', port, context=context) as server:
                    server.login(sender_email, app_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP('smtp.gmail.com', port) as server:
                    server.ehlo()
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                    server.login(sender_email, app_password)
                    server.send_message(msg)
            print(f"✅ Successfully sent email to {to_email}")
            return True
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"Failed to send email (tried SMTP :587 and :465): {last_err}") from last_err

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Send a cold outreach email.")
    parser.add_argument("--to", required=True, help="Recipient email address")
    parser.add_argument("--subject", required=True, help="Email subject")
    parser.add_argument("--body", required=True, help="Email body content")
    parser.add_argument("--attachment", help="Path to a file to attach")
    
    args = parser.parse_args()
    send_email(args.to, args.subject, args.body, args.attachment)
