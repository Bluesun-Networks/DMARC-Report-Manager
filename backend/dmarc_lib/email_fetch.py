import email
import imaplib
import logging
import poplib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from .db import get_setting

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("backend/uploads")
REPORT_EXTENSIONS = (".xml", ".zip", ".gz", ".xz")


@dataclass
class EmailFetchResult:
    success: bool
    files: list[str] = field(default_factory=list)
    messages_checked: int = 0
    attachments_checked: int = 0
    error: str | None = None

    @property
    def message(self) -> str:
        if not self.success:
            return self.error or "Email fetch failed."
        if self.files:
            return f"Found {len(self.files)} new report attachment(s)."
        return "No report attachments found in email."

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "files": self.files,
            "messages_checked": self.messages_checked,
            "attachments_checked": self.attachments_checked,
            "error": self.error,
            "message": self.message,
        }


def get_email_settings() -> dict[str, Any]:
    protocol = str(get_setting("email_protocol", "imap") or "imap").lower()
    protocol = protocol if protocol in ("imap", "pop3") else "imap"
    use_ssl = bool(get_setting("imap_use_ssl", True))
    default_port = 995 if protocol == "pop3" and use_ssl else 110 if protocol == "pop3" else 993 if use_ssl else 143
    return {
        "protocol": protocol,
        "host": get_setting("imap_host", ""),
        "port": int(get_setting("imap_port", default_port)),
        "user": get_setting("imap_user", ""),
        "password": get_setting("imap_pass", ""),
        "use_ssl": use_ssl,
        "mailbox": get_setting("email_mailbox", "inbox") or "inbox",
        "only_unread": bool(get_setting("email_only_unread", True)),
        "delete_after_fetch": bool(get_setting("email_delete_after_fetch", False)),
    }


def fetch_dmarc_reports() -> list[str]:
    """Backward-compatible helper that returns only saved file names."""
    return fetch_dmarc_reports_with_status().files


def fetch_dmarc_reports_with_status() -> EmailFetchResult:
    settings = get_email_settings()
    missing = [key for key in ("host", "user", "password") if not settings.get(key)]
    if missing:
        return EmailFetchResult(
            success=False,
            error=f"Email settings incomplete: missing {', '.join(missing)}.",
        )

    try:
        if settings["protocol"] == "pop3":
            return _fetch_pop3(settings)
        return _fetch_imap(settings)
    except Exception as exc:
        logger.exception("Failed to fetch DMARC reports from email")
        return EmailFetchResult(success=False, error=str(exc))


def _fetch_imap(settings: dict[str, Any]) -> EmailFetchResult:
    if settings["use_ssl"]:
        mail = imaplib.IMAP4_SSL(settings["host"], settings["port"])
    else:
        mail = imaplib.IMAP4(settings["host"], settings["port"])

    try:
        mail.login(settings["user"], settings["password"])
        status, _ = mail.select(settings["mailbox"])
        if status != "OK":
            return EmailFetchResult(success=False, error=f"Could not select mailbox '{settings['mailbox']}'.")

        criteria = "UNSEEN" if settings["only_unread"] else "ALL"
        status, messages = mail.search(None, criteria)
        if status != "OK":
            return EmailFetchResult(success=False, error=f"IMAP search failed with criteria {criteria}.")

        result = EmailFetchResult(success=True)
        for num in messages[0].split():
            status, data = mail.fetch(num, "(RFC822)")
            if status != "OK" or not data or not data[0]:
                continue
            result.messages_checked += 1
            msg = email.message_from_bytes(data[0][1])
            result.files.extend(_save_report_attachments(msg, result))
        return result
    finally:
        try:
            mail.logout()
        except Exception:
            pass


def _fetch_pop3(settings: dict[str, Any]) -> EmailFetchResult:
    if settings["use_ssl"]:
        mail = poplib.POP3_SSL(settings["host"], settings["port"])
    else:
        mail = poplib.POP3(settings["host"], settings["port"])

    try:
        mail.user(settings["user"])
        mail.pass_(settings["password"])
        message_count, _ = mail.stat()
        result = EmailFetchResult(success=True)

        for index in range(1, message_count + 1):
            _, lines, _ = mail.retr(index)
            result.messages_checked += 1
            msg = email.message_from_bytes(b"\r\n".join(lines))
            saved = _save_report_attachments(msg, result)
            result.files.extend(saved)
            if saved and settings["delete_after_fetch"]:
                mail.dele(index)
        return result
    finally:
        try:
            mail.quit()
        except Exception:
            pass


def _save_report_attachments(msg: email.message.Message, result: EmailFetchResult) -> list[str]:
    saved_files = []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get("Content-Disposition") is None:
            continue

        filename = part.get_filename()
        if not filename:
            continue

        result.attachments_checked += 1
        lower_fn = filename.lower()
        if not lower_fn.endswith(REPORT_EXTENSIONS):
            continue

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = _safe_attachment_name(filename)
        filepath = UPLOAD_DIR / safe_name
        payload = part.get_payload(decode=True)
        if payload is None:
            continue

        with filepath.open("wb") as f:
            f.write(payload)
        saved_files.append(safe_name)
        logger.info("Downloaded DMARC report attachment: %s", safe_name)
    return saved_files


def _safe_attachment_name(filename: str) -> str:
    safe_name = Path(filename).name
    if not safe_name:
        safe_name = f"dmarc-report-{uuid4().hex}.xml"

    target = UPLOAD_DIR / safe_name
    if not target.exists():
        return safe_name

    stem = target.stem
    suffix = target.suffix
    return f"{stem}-{uuid4().hex[:8]}{suffix}"
