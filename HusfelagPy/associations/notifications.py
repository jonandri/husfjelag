import logging
from html import escape as _esc

from django.conf import settings

logger = logging.getLogger(__name__)


def send_email(to, subject, html):
    """Send a single transactional email via Resend.

    Returns True if dispatched, False if email is not configured (no API key —
    e.g. local dev), and raises on Resend API errors so callers can report them.
    """
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key:
        logger.info("send_email skipped (RESEND_API_KEY not set): to=%s subject=%s", to, subject)
        return False

    import resend

    resend.api_key = api_key
    resend.Emails.send({
        "from": settings.DEFAULT_FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
    })
    return True


# ── Email template helpers ────────────────────────────────────────────────────

_TYPE_ORDER = ["SHARED", "SHARE2", "SHARE3", "EQUAL"]

_TYPE_CFG = {
    "SHARED": {"bar": "#08C076", "bg": "#e8f5e9", "fg": "#08a565", "label": "Sameiginlegt", "row_bg": "#fbfdfc"},
    "SHARE2": {"bar": "#2BA8D8", "bg": "#e3f4fb", "fg": "#1d8cb3", "label": "Hiti",         "row_bg": "#fbfdfe"},
    "SHARE3": {"bar": "#F5A623", "bg": "#fdf0dc", "fg": "#b3760f", "label": "Lóð",          "row_bg": "#fffdfa"},
    "EQUAL":  {"bar": "#9C46C9", "bg": "#f3e6fa", "fg": "#7e2fa8", "label": "Jafnskipt",    "row_bg": "#fdfbff"},
}

_SANS = "'Switzer',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
_MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace"


def _kr(n):
    """Format integer amount Icelandic-style: 905.000 kr."""
    v = int(round(float(n)))
    prefix = "−" if v < 0 else ""
    formatted = f"{abs(v):,}".replace(",", ".")
    return f"{prefix}{formatted} kr."


def _pct(n):
    """Format percentage Icelandic-style: 21,80%"""
    return f"{float(n):.2f}".replace(".", ",") + "%"


def _kennitala(kt):
    """Format kennitala as 000000-0000."""
    s = str(kt or "").replace("-", "").strip()
    if len(s) == 10:
        return f"{s[:6]}-{s[6:]}"
    return s


def build_budget_overview_email(association, budget, budget_items, payer_rows, group_totals, grand_total):
    """
    Build the HTML email for the annual budget overview + monthly payer amounts.

    Args:
        association: Association instance
        budget: Budget instance
        budget_items: iterable of BudgetItem (with .category pre-fetched)
        payer_rows: list of dicts — apt_anr, payer_name, payer_kennitala,
                    share, share_2, share_3, monthly_fee
        group_totals: dict mapping CategoryType string -> Decimal
        grand_total: Decimal
    """
    monthly_total = grand_total / 12

    # ── Split bar ──────────────────────────────────────────────────────────────
    active_types = [t for t in _TYPE_ORDER if group_totals.get(t, 0)]
    bar_parts = []
    legend_parts = []
    remaining_pct = 100
    for i, t in enumerate(active_types):
        cfg = _TYPE_CFG[t]
        exact = float(group_totals[t]) / float(grand_total) * 100
        w = remaining_pct if i == len(active_types) - 1 else int(round(exact))
        remaining_pct -= w
        bar_parts.append(
            f'<td width="{w}%" height="12" style="background:{cfg["bar"]}; font-size:0; line-height:0;">&nbsp;</td>'
        )
        legend_parts.append(
            f'<td style="padding:3px 18px 3px 0;">'
            f'<span style="display:inline-block; width:9px; height:9px; border-radius:2px; background:{cfg["bar"]};"></span>'
            f'<span style="font-family:{_SANS}; font-size:12px; color:#333; padding-left:7px;">'
            f'{cfg["label"]} <strong>{int(round(exact))}%</strong></span></td>'
        )

    # ── Budget table rows ──────────────────────────────────────────────────────
    items_by_type = {}
    for item in budget_items:
        t = item.category.type
        if t not in _TYPE_CFG:
            continue
        items_by_type.setdefault(t, []).append(item)

    budget_rows = []
    for t in _TYPE_ORDER:
        if t not in group_totals or not group_totals[t]:
            continue
        cfg = _TYPE_CFG[t]
        items = sorted(items_by_type.get(t, []), key=lambda x: x.category.name)
        n = len(items)
        grp_annual = group_totals[t]
        grp_monthly = grp_annual / 12
        budget_rows.append(
            f'<tr>'
            f'<td style="padding:11px 18px; background:{cfg["row_bg"]}; border-bottom:1px solid #f2f2f2;">'
            f'<span style="display:inline-block; background:{cfg["bg"]}; color:{cfg["fg"]}; font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; letter-spacing:0.02em;">{cfg["label"]}</span>'
            f'<span style="font-family:{_SANS}; font-size:12px; color:#888; padding-left:8px;">{n} {"flokkur" if n == 1 else "flokkar"}</span>'
            f'</td>'
            f'<td align="right" style="padding:11px 18px; background:{cfg["row_bg"]}; border-bottom:1px solid #f2f2f2;">'
            f'<span style="font-family:{_MONO}; font-size:13px; font-weight:600; color:#333;">{_kr(grp_annual)}</span></td>'
            f'<td align="right" style="padding:11px 18px; background:{cfg["row_bg"]}; border-bottom:1px solid #f2f2f2;">'
            f'<span style="font-family:{_MONO}; font-size:13px; font-weight:600; color:#333;">{_kr(grp_monthly)}</span></td>'
            f'</tr>'
        )
        for item in items:
            budget_rows.append(
                f'<tr>'
                f'<td style="padding:10px 18px; border-bottom:1px solid #f2f2f2;">'
                f'<span style="display:inline-block; width:3px; height:14px; background:{cfg["bar"]}; border-radius:2px; vertical-align:-3px;"></span>'
                f'<span style="font-family:{_SANS}; font-size:13.5px; color:#333; padding-left:11px;">{_esc(item.category.name)}</span>'
                f'</td>'
                f'<td align="right" style="padding:10px 18px; border-bottom:1px solid #f2f2f2;">'
                f'<span style="font-family:{_MONO}; font-size:13px; color:#555;">{_kr(item.amount)}</span></td>'
                f'<td align="right" style="padding:10px 18px; border-bottom:1px solid #f2f2f2;">'
                f'<span style="font-family:{_MONO}; font-size:13px; color:#888;">{_kr(item.amount / 12)}</span></td>'
                f'</tr>'
            )

    # ── Payer rows ─────────────────────────────────────────────────────────────
    payer_html_rows = []
    payer_total = sum(r["monthly_fee"] for r in payer_rows)
    for row in sorted(payer_rows, key=lambda r: r["apt_anr"]):
        payer_html_rows.append(
            f'<tr>'
            f'<td style="padding:12px 16px; border-bottom:1px solid #f2f2f2;">'
            f'<span style="font-family:{_MONO}; font-size:13px; font-weight:600; color:#1D366F;">{_esc(row["apt_anr"])}</span></td>'
            f'<td style="padding:12px 16px; border-bottom:1px solid #f2f2f2;">'
            + (
                f'<span style="font-family:{_SANS}; font-size:13.5px; color:#111; font-weight:500;">{_esc(row["payer_name"])}</span><br>'
                f'<span style="font-family:{_MONO}; font-size:11.5px; color:#999;">{_esc(_kennitala(row["payer_kennitala"]))}</span>'
                if row["payer_name"] else
                f'<span style="font-family:{_SANS}; font-size:13px; color:#b45309; font-style:italic;">Vantar greiðanda</span>'
            ) +
            f'</td>'
            f'<td align="right" style="padding:12px 14px; border-bottom:1px solid #f2f2f2;">'
            f'<span style="font-family:{_MONO}; font-size:13px; color:#333;">{_pct(row["share"])}</span></td>'
            f'<td align="right" style="padding:12px 14px; border-bottom:1px solid #f2f2f2;">'
            f'<span style="font-family:{_MONO}; font-size:13px; color:#666;">{_pct(row["share_2"])}</span></td>'
            f'<td align="right" style="padding:12px 14px; border-bottom:1px solid #f2f2f2;">'
            f'<span style="font-family:{_MONO}; font-size:13px; color:#666;">{_pct(row["share_3"])}</span></td>'
            f'<td align="right" style="padding:12px 16px; border-bottom:1px solid #f2f2f2;">'
            f'<span style="font-family:{_MONO}; font-size:13.5px; font-weight:600; color:#2e7d32;">{_kr(row["monthly_fee"])}</span></td>'
            f'</tr>'
        )

    assoc_name = _esc(association.name)
    assoc_ssn  = _esc(_kennitala(association.ssn))

    return (
        '<!DOCTYPE html>'
        '<html lang="is">'
        '<head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        '<meta http-equiv="x-ua-compatible" content="IE=edge">'
        f'<title>Húsgjöld &amp; fjárhagsáætlun — {assoc_name}</title>'
        '</head>'
        '<body style="margin:0; padding:0; background:#eef0f3;">'

        # preheader
        '<div style="display:none; max-height:0; overflow:hidden; opacity:0; font-size:1px; line-height:1px; color:#eef0f3;">'
        'Fjárhagsáætlun ársins og mánaðarleg húsgjöld — sundurliðun eftir flokkum og greiðendum.'
        '</div>'

        # outer table
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;">'
        '<tr><td align="center" style="padding:32px 16px;">'

        # card
        '<table role="presentation" width="760" cellpadding="0" cellspacing="0"'
        f' style="width:760px; max-width:760px; background:#ffffff; border-radius:14px; overflow:hidden;'
        f' box-shadow:0 1px 2px rgba(17,17,17,0.04), 0 8px 28px rgba(13,33,84,0.10);'
        f' font-family:{_SANS};">'

        # header
        '<tr><td style="background:#1D366F; padding:30px 36px 26px 36px;" align="left">'
        f'<div style="font-size:25px; font-weight:600; color:#ffffff; line-height:1.25;">Húsgjöld &amp; fjárhagsáætlun</div>'
        f'<div style="font-size:14px; color:#aebbda; padding-top:4px;">{assoc_name}'
        f' · Kennitala <span style="font-family:{_MONO}; font-size:13px; color:#aebbda;">{assoc_ssn}</span>'
        f' · Áætlun {budget.year}</div>'
        '</td></tr>'

        # intro
        '<tr><td style="padding:28px 36px 4px 36px;">'
        f'<p style="margin:0; font-size:15px; line-height:1.6; color:#333333; font-family:{_SANS};">'
        'Hér að neðan er <strong style="color:#111111;">fjárhagsáætlun ársins</strong> sundurliðuð eftir flokkum,'
        ' ásamt <strong style="color:#111111;">mánaðarlegum húsgjöldum</strong> þar sem sjá má greiðanda hverrar'
        ' íbúðar og hlutfall hennar í heildarkostnaði.'
        '</p></td></tr>'

        # section 1 heading
        '<tr><td style="padding:30px 36px 0 36px;">'
        f'<div style="font-family:{_SANS}; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#08C076;">01 — Fjárhagsáætlun</div>'
        f'<div style="font-family:{_SANS}; font-size:19px; font-weight:600; color:#111111; padding-top:5px;">Heildaráætlun ársins</div>'
        '</td></tr>'

        # hero totals
        '<tr><td style="padding:16px 36px 0 36px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"'
        ' style="background:#fafafa; border:1px solid #e8e8e8; border-radius:12px;">'
        '<tr>'
        '<td width="58%" style="padding:18px 22px; border-right:1px solid #e8e8e8;">'
        f'<div style="font-family:{_SANS}; font-size:10.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#888888;">Heildartala á ári</div>'
        f'<div style="font-family:{_MONO}; font-size:30px; font-weight:600; color:#1D366F; padding-top:6px; letter-spacing:-0.01em;">{_kr(grand_total)}</div>'
        '</td>'
        '<td width="42%" style="padding:18px 22px;">'
        f'<div style="font-family:{_SANS}; font-size:10.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#888888;">Á mánuði</div>'
        f'<div style="font-family:{_MONO}; font-size:22px; font-weight:600; color:#111111; padding-top:8px;">{_kr(monthly_total)}</div>'
        '</td>'
        '</tr></table></td></tr>'

        # split bar
        '<tr><td style="padding:16px 36px 0 36px;">'
        f'<div style="font-family:{_SANS}; font-size:10.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#888888; padding-bottom:8px;">Skipting eftir tegund</div>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px; overflow:hidden;">'
        f'<tr>{"".join(bar_parts)}</tr>'
        '</table>'
        '<table role="presentation" cellpadding="0" cellspacing="0" style="padding-top:10px;">'
        f'<tr>{"".join(legend_parts)}</tr>'
        '</table></td></tr>'

        # budget table
        '<tr><td style="padding:20px 36px 0 36px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"'
        ' style="border:1px solid #e8e8e8; border-radius:12px; overflow:hidden;">'
        '<tr>'
        '<td style="background:#f5f5f5; padding:9px 18px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Flokkur</span></td>'
        '<td align="right" style="background:#f5f5f5; padding:9px 18px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Á ári</span></td>'
        '<td align="right" style="background:#f5f5f5; padding:9px 18px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Á mánuði</span></td>'
        '</tr>'
        + "".join(budget_rows) +
        '<tr>'
        '<td style="padding:13px 18px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_SANS}; font-size:14px; font-weight:700; color:#111;">Samtals</span></td>'
        '<td align="right" style="padding:13px 18px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_MONO}; font-size:14px; font-weight:700; color:#111;">{_kr(grand_total)}</span></td>'
        '<td align="right" style="padding:13px 18px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_MONO}; font-size:14px; font-weight:700; color:#111;">{_kr(monthly_total)}</span></td>'
        '</tr>'
        '</table></td></tr>'

        # divider
        '<tr><td style="padding:30px 36px 0 36px;">'
        '<div style="border-top:1px solid #eceef1; font-size:0; line-height:0;">&nbsp;</div></td></tr>'

        # section 2 heading
        '<tr><td style="padding:24px 36px 0 36px;">'
        f'<div style="font-family:{_SANS}; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#08C076;">02 — Greiðendur</div>'
        f'<div style="font-family:{_SANS}; font-size:19px; font-weight:600; color:#111111; padding-top:5px;">Mánaðarleg húsgjöld</div>'
        f'<p style="margin:8px 0 0 0; font-size:13.5px; line-height:1.55; color:#555; font-family:{_SANS};">'
        'Skráður greiðandi hverrar íbúðar og hlutfall hennar í hverjum kostnaðarlykli —'
        ' almennt eignarhlutfall, hita og lóð. Upphæðin greiðist mánaðarlega.'
        '</p></td></tr>'

        # payer table
        '<tr><td style="padding:16px 36px 0 36px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"'
        ' style="border:1px solid #e8e8e8; border-radius:12px; overflow:hidden;">'
        '<tr>'
        '<td style="background:#f5f5f5; padding:9px 16px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Íbúð</span></td>'
        '<td style="background:#f5f5f5; padding:9px 16px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Greiðandi</span></td>'
        '<td align="right" style="background:#f5f5f5; padding:9px 14px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Hlutfall</span></td>'
        '<td align="right" style="background:#f5f5f5; padding:9px 14px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#2BA8D8;">Hiti</span></td>'
        '<td align="right" style="background:#f5f5f5; padding:9px 14px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#cf8a14;">Lóð</span></td>'
        '<td align="right" style="background:#f5f5f5; padding:9px 16px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Á mánuði</span></td>'
        '</tr>'
        + "".join(payer_html_rows) +
        '<tr>'
        '<td style="padding:13px 16px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_SANS}; font-size:14px; font-weight:700; color:#111;">Samtals</span></td>'
        '<td style="padding:13px 16px; background:#f7f8fa; border-top:2px solid #dfe2e8;"></td>'
        '<td align="right" style="padding:13px 14px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_MONO}; font-size:13px; font-weight:700; color:#555;">100,00%</span></td>'
        '<td align="right" style="padding:13px 14px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_MONO}; font-size:13px; font-weight:700; color:#555;">100,00%</span></td>'
        '<td align="right" style="padding:13px 14px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_MONO}; font-size:13px; font-weight:700; color:#555;">100,00%</span></td>'
        '<td align="right" style="padding:13px 16px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_MONO}; font-size:14px; font-weight:700; color:#111;">{_kr(payer_total)}</span></td>'
        '</tr>'
        '</table>'
        f'<p style="margin:12px 2px 0 2px; font-size:11.5px; line-height:1.5; color:#999; font-family:{_SANS};">'
        'Hlutföllin miðast við eignarhlut íbúðar í hverjum kostnaðarlykli: almennt hlutfall fyrir sameiginlegan'
        ' kostnað, sérstakt hlutfall fyrir hita og lóð. Jafnskiptur kostnaður deilist jafnt á íbúðir.'
        '</p></td></tr>'

        # footer
        '<tr><td style="padding:24px 36px 0 36px; font-size:0; line-height:0;">&nbsp;</td></tr>'
        '<tr><td style="padding:30px 36px 34px 36px; background:#1D366F;">'
        f'<p style="margin:0; font-size:13.5px; line-height:1.6; color:#c2cde6; font-family:{_SANS};">'
        'Spurningar um yfirlitið?<br>'
        'Hafðu samband við stjórn húsfélagsins eða svaraðu þessum tölvupósti.'
        '</p>'
        f'<a href="https://husfjelag.is" target="_blank"'
        f' style="display:inline-block; margin-top:20px; font-family:{_SANS}; font-size:14px;'
        f' font-weight:600; color:#ffffff; text-decoration:none; letter-spacing:0.02em;">Húsfjelag.is</a>'
        '</td></tr>'

        '</table>'  # /card
        '<div style="height:20px; line-height:20px;">&nbsp;</div>'
        '</td></tr></table>'  # /outer
        '</body></html>'
    )


_MONTHS_IS = [
    "", "janúar", "febrúar", "mars", "apríl", "maí", "júní",
    "júlí", "ágúst", "september", "október", "nóvember", "desember",
]


def _period_label(year, month):
    """'maí 2026' — Icelandic month + year."""
    name = _MONTHS_IS[month] if 1 <= int(month) <= 12 else str(month)
    return f"{name} {year}"


def build_payment_reminder_email(association, payer_name, payer_kennitala, items):
    """
    Build the HTML email reminding a payer about unpaid housing fees (húsgjöld).

    Reuses the navy header/footer style of the budget overview email.

    Args:
        association: Association instance
        payer_name: str — the payer's name
        payer_kennitala: str — the payer's kennitala
        items: list of dicts, ordered oldest-first, each with:
               anr (apartment), year, month, amount (Decimal/number)

    The email lists every unpaid period for this payer — the current one plus
    any older outstanding invoices — with a total at the bottom.
    """
    assoc_name = _esc(association.name or "")
    assoc_ssn = _esc(_kennitala(association.ssn))
    name = _esc(payer_name or "")
    kt = _esc(_kennitala(payer_kennitala))

    total = sum(float(it["amount"]) for it in items)
    has_older = len(items) > 1

    # Build the table rows
    item_rows = []
    for i, it in enumerate(items):
        last = i == len(items) - 1
        border = "" if last else " border-bottom:1px solid #f0f0f0;"
        item_rows.append(
            '<tr>'
            f'<td style="padding:11px 16px;{border}">'
            f'<span style="font-family:{_SANS}; font-size:13.5px; color:#222; text-transform:capitalize;">{_esc(_period_label(it["year"], it["month"]))}</span></td>'
            f'<td style="padding:11px 16px;{border}">'
            f'<span style="font-family:{_SANS}; font-size:13.5px; color:#555;">Íbúð {_esc(str(it["anr"]))}</span></td>'
            f'<td align="right" style="padding:11px 16px;{border}">'
            f'<span style="font-family:{_MONO}; font-size:13.5px; font-weight:600; color:#111;">{_kr(it["amount"])}</span></td>'
            '</tr>'
        )

    older_note = (
        '<p style="margin:14px 0 0 0; font-size:13.5px; line-height:1.6; color:#b3760f; '
        f'font-family:{_SANS};">Athugið að eldri húsgjöld eru einnig ógreidd og eru talin upp hér að ofan.</p>'
        if has_older else ''
    )

    return (
        '<!DOCTYPE html>'
        '<html lang="is">'
        '<head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        '<meta http-equiv="x-ua-compatible" content="IE=edge">'
        f'<title>Áminning um húsgjöld — {assoc_name}</title>'
        '</head>'
        '<body style="margin:0; padding:0; background:#eef0f3;">'

        # preheader
        '<div style="display:none; max-height:0; overflow:hidden; opacity:0; font-size:1px; line-height:1px; color:#eef0f3;">'
        'Áminning um ógreidd húsgjöld.'
        '</div>'

        # outer table
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3;">'
        '<tr><td align="center" style="padding:32px 16px;">'

        # card
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0"'
        f' style="width:600px; max-width:600px; background:#ffffff; border-radius:14px; overflow:hidden;'
        f' box-shadow:0 1px 2px rgba(17,17,17,0.04), 0 8px 28px rgba(13,33,84,0.10);'
        f' font-family:{_SANS};">'

        # header
        '<tr><td style="background:#1D366F; padding:30px 36px 26px 36px;" align="left">'
        '<div style="font-size:25px; font-weight:600; color:#ffffff; line-height:1.25;">Áminning um húsgjöld</div>'
        f'<div style="font-size:14px; color:#aebbda; padding-top:4px;">{assoc_name}'
        f' · Kennitala <span style="font-family:{_MONO}; font-size:13px; color:#aebbda;">{assoc_ssn}</span></div>'
        '</td></tr>'

        # intro
        '<tr><td style="padding:28px 36px 4px 36px;">'
        f'<p style="margin:0; font-size:15px; line-height:1.6; color:#333333; font-family:{_SANS};">'
        f'Sæl/l <strong style="color:#111111;">{name}</strong>'
        f' <span style="color:#999; font-family:{_MONO}; font-size:13px;">({kt})</span>.<br>'
        'Samkvæmt bókhaldi húsfélagsins eru eftirfarandi húsgjöld enn '
        '<strong style="color:#111111;">ógreidd</strong>. '
        'Vinsamlegast gerðu skil hið fyrsta.'
        '</p></td></tr>'

        # items table
        '<tr><td style="padding:20px 36px 0 36px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"'
        ' style="border:1px solid #e8e8e8; border-radius:12px; overflow:hidden;">'
        '<tr>'
        '<td style="background:#f5f5f5; padding:9px 16px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Tímabil</span></td>'
        '<td style="background:#f5f5f5; padding:9px 16px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Íbúð</span></td>'
        '<td align="right" style="background:#f5f5f5; padding:9px 16px; border-bottom:1px solid #e8e8e8;">'
        '<span style="font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#888;">Upphæð</span></td>'
        '</tr>'
        + "".join(item_rows) +
        '<tr>'
        '<td colspan="2" style="padding:13px 16px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_SANS}; font-size:14px; font-weight:700; color:#111;">Samtals ógreitt</span></td>'
        '<td align="right" style="padding:13px 16px; background:#f7f8fa; border-top:2px solid #dfe2e8;">'
        f'<span style="font-family:{_MONO}; font-size:14px; font-weight:700; color:#c0392b;">{_kr(total)}</span></td>'
        '</tr>'
        '</table>'
        f'{older_note}'
        '</td></tr>'

        # footer
        '<tr><td style="padding:24px 36px 0 36px; font-size:0; line-height:0;">&nbsp;</td></tr>'
        '<tr><td style="padding:30px 36px 34px 36px; background:#1D366F;">'
        f'<p style="margin:0; font-size:13.5px; line-height:1.6; color:#c2cde6; font-family:{_SANS};">'
        'Spurningar um húsgjöldin?<br>'
        'Hafðu samband við stjórn húsfélagsins eða svaraðu þessum tölvupósti.'
        '</p>'
        f'<a href="https://husfjelag.is" target="_blank"'
        f' style="display:inline-block; margin-top:20px; font-family:{_SANS}; font-size:14px;'
        f' font-weight:600; color:#ffffff; text-decoration:none; letter-spacing:0.02em;">Húsfjelag.is</a>'
        '</td></tr>'

        '</table>'  # /card
        '<div style="height:20px; line-height:20px;">&nbsp;</div>'
        '</td></tr></table>'  # /outer
        '</body></html>'
    )
