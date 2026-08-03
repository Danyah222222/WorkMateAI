"""
Email delivery for WorkMate AI.

Graceful-fallback design:
- If RESEND_API_KEY is set in the environment, we send via Resend.
- If not, we no-op and rely on the caller to surface the token/link
  in the API response (dev fallback used by /forgot-password, etc.).

Never crashes the auth flow: any failure logs and returns False.
"""
from __future__ import annotations

import os
import asyncio
import logging
from typing import Optional

logger = logging.getLogger("workmate.email")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip()
SENDER_NAME = os.environ.get("SENDER_NAME", "WorkMate AI").strip()

_configured = False
if RESEND_API_KEY:
    try:
        import resend  # noqa
        resend.api_key = RESEND_API_KEY
        _configured = True
    except Exception as e:  # pragma: no cover
        logger.warning(f"Resend import failed, email delivery disabled: {e}")
        _configured = False


def is_configured() -> bool:
    return _configured


async def send_email(to: str, subject: str, html: str) -> bool:
    """Send an email. Returns True on success, False otherwise. Never raises."""
    if not _configured:
        logger.info(f"[email:noop] to={to} subject={subject!r} (RESEND_API_KEY not set)")
        return False
    try:
        import resend
        from_hdr = f"{SENDER_NAME} <{SENDER_EMAIL}>" if SENDER_NAME else SENDER_EMAIL
        params = {"from": from_hdr, "to": [to], "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"[email:sent] to={to} id={result.get('id') if isinstance(result, dict) else result}")
        return True
    except Exception as e:
        logger.exception(f"[email:failed] to={to} subject={subject!r} err={e}")
        return False


# ---------------- Templates ----------------
_BASE_CSS = (
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
    " color: #0f172a; line-height: 1.55;"
)


def _shell(inner: str, preheader: str = "") -> str:
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;">
  <span style="display:none;opacity:0;visibility:hidden;height:0;width:0;overflow:hidden">{preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 32px;border-bottom:1px solid #f1f5f9;">
          <div style="{_BASE_CSS} font-size:18px;font-weight:700;letter-spacing:-0.01em;">WorkMate AI</div>
        </td></tr>
        <tr><td style="padding:28px 32px;{_BASE_CSS} font-size:15px;">
          {inner}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #f1f5f9;{_BASE_CSS} font-size:12px;color:#64748b;">
          You&#39;re receiving this because your email is registered with WorkMate AI. If this wasn&#39;t you, you can safely ignore this message.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _button(url: str, label: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:#0f172a;color:#ffffff;'
        f'text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">{label}</a>'
    )


def welcome_template(name: str, workspace: Optional[str], login_url: str) -> str:
    ws = f' at <strong>{workspace}</strong>' if workspace else ""
    inner = f"""
      <h1 style="{_BASE_CSS} margin:0 0 12px;font-size:22px;font-weight:700;">Welcome{ ' ' + name if name else ''} 👋</h1>
      <p style="margin:0 0 16px;">Your WorkMate AI account{ws} is ready. Ask the AI anything about your work, run automations, and stay on top of tasks.</p>
      <p style="margin:20px 0;">{_button(login_url, 'Open WorkMate')}</p>
      <p style="margin:0;color:#475569;font-size:13px;">Tip: pin the app in your browser for quick access.</p>
    """
    return _shell(inner, preheader="Your WorkMate AI account is ready.")


def password_reset_template(reset_url: str) -> str:
    inner = f"""
      <h1 style="{_BASE_CSS} margin:0 0 12px;font-size:22px;font-weight:700;">Reset your password</h1>
      <p style="margin:0 0 16px;">We received a request to reset your WorkMate password. Click below to choose a new one. The link expires in 2 hours and can be used once.</p>
      <p style="margin:20px 0;">{_button(reset_url, 'Reset password')}</p>
      <p style="margin:0;color:#475569;font-size:13px;">If you didn&#39;t request this, just ignore this email — nothing will change.</p>
    """
    return _shell(inner, preheader="Reset your WorkMate password.")


def email_change_verify_template(verify_url: str, old_email: str) -> str:
    inner = f"""
      <h1 style="{_BASE_CSS} margin:0 0 12px;font-size:22px;font-weight:700;">Confirm your new email</h1>
      <p style="margin:0 0 16px;">A request was made to change the email on your WorkMate account (<strong>{old_email}</strong>) to this address. Click below to confirm. The link expires in 2 hours.</p>
      <p style="margin:20px 0;">{_button(verify_url, 'Confirm new email')}</p>
      <p style="margin:0;color:#475569;font-size:13px;">If you didn&#39;t request this, please ignore — your account is safe and no change will be made.</p>
    """
    return _shell(inner, preheader="Confirm your new WorkMate email address.")
