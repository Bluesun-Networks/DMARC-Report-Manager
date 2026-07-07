import email

from backend.dmarc_lib import email_fetch
from backend.dmarc_lib.db import init_db, set_setting


def test_fetch_reports_reports_incomplete_settings():
    init_db()

    result = email_fetch.fetch_dmarc_reports_with_status()

    assert result.success is False
    assert "missing host" in result.error


def test_save_report_attachments_sanitizes_and_deduplicates(tmp_path, monkeypatch):
    monkeypatch.setattr(email_fetch, "UPLOAD_DIR", tmp_path)
    msg = email.message.EmailMessage()
    msg.add_attachment(
        b"<feedback></feedback>",
        maintype="application",
        subtype="xml",
        filename="../report.xml",
    )
    result = email_fetch.EmailFetchResult(success=True)

    first = email_fetch._save_report_attachments(msg, result)
    second = email_fetch._save_report_attachments(msg, result)

    assert first == ["report.xml"]
    assert second[0].startswith("report-")
    assert second[0].endswith(".xml")
    assert (tmp_path / first[0]).exists()
    assert (tmp_path / second[0]).exists()


def test_email_settings_support_pop3_defaults():
    init_db()
    set_setting("email_protocol", "pop3")
    set_setting("imap_use_ssl", True)

    settings = email_fetch.get_email_settings()

    assert settings["protocol"] == "pop3"
    assert settings["port"] == 995
