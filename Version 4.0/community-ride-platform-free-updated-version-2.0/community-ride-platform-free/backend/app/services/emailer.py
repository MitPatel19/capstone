import logging
import smtplib
from email.message import EmailMessage

from app.core.settings import settings

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, text_body: str, html_body: str = "") -> bool:
    if not settings.smtp_enabled():
        return False

    smtp_username = settings.SMTP_USERNAME.strip()
    smtp_password = settings.SMTP_PASSWORD.replace(" ", "").strip()
    from_email = settings.SMTP_FROM_EMAIL.strip()

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{from_email}>"
    msg["To"] = to_email
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if smtp_username:
                server.login(smtp_username, smtp_password)
            server.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        logger.warning(
            "Email delivery failed to %s via %s:%s: %s",
            to_email,
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            exc,
        )
        return False
