#!/usr/bin/env python3
"""
Parse Luxembourg Indoor Meeting result PDFs into meetingResults.json format.
Run one year at a time:
    python3 scripts/parse-pdf-results.py 2009
    python3 scripts/parse-pdf-results.py 2009 --preview   # dry run, no file write
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber

# ─── Config ──────────────────────────────────────────────────────────────────

PDF_DIR = Path.home() / "Downloads" / "Indoor Meeting"

def _find_output():
    """Locate meetingResults.json — prefer the most-recently-modified worktree file."""
    base = Path(__file__).parent.parent
    # If main repo has the file, use it directly
    candidate = base / "src" / "data" / "meetingResults.json"
    if candidate.exists():
        return candidate
    # Otherwise pick the worktree file that was modified most recently
    wts = list((base / ".claude" / "worktrees").glob("*/src/data/meetingResults.json"))
    if wts:
        return max(wts, key=lambda p: p.stat().st_mtime)
    return candidate  # fallback (may not exist yet)

OUTPUT = _find_output()

PDF_MAP = {
    2003: "1. FLA Indoor Meeting 2003.pdf",
    2004: "2. FLA Indoor Meeting 2004.pdf",
    2005: "3. FLA Indoor Meeting 2005.pdf",
    2006: "4. PEDUS Indoor Meeting 2006.pdf",
    2007: "5. PEDUS Indoor Meeting 2007.pdf",
    2008: "6. PEDUS Indoor Meeting 2008.pdf",
    2009: "7. DUSSMANN Indoor Meeting 2009.pdf",
    2010: "8. DUSSMANN Indoor Meeting 2010.pdf",
    2011: "9. DUSSMANN Indoor Meeting 2011.pdf",
    2012: "10. DUSSMANN Indoor Meeting 2012.pdf",
    2013: "11. DUSSMANN Indoor Meeting 2013.pdf",
    2014: "12. FLA Indoor Meeting 2014.pdf",
    2015: "13. VECTIS Indoor Meeting 2015.pdf",
    2016: "14. VECTIS Indoor Meeting 2016.pdf",
    2017: "15. VECTIS Indoor Meeting 2017.pdf",
    2018: "16. CMCM Indoor Meeting 2018.pdf",
    2019: "17. CMCM Indoor Meeting 2019.pdf",
    2020: "18. CMCM Indoor Meeting 2020.pdf",
    2021: "19. CMCM Indoor Meeting 2021.pdf",
    2023: "20. CMCM Indoor Meeting 2023.pdf",
    2024: "21. CMCM Indoor Meeting 2024.pdf",
    2025: "22. CMCM Indoor Meeting 2025.pdf",
    2026: "23. CMCM Indoor Meeting 2026.pdf",
}

# ─── Discipline normalisation ─────────────────────────────────────────────────

DISC_MAP = [
    (r"60\s*m\s+h[ai]+es?",     "60m Hurdles"),
    (r"60\s*m\s+hurdles?",      "60m Hurdles"),
    (r"60\s*m",                 "60m"),
    (r"100\s*m",                "100m"),
    (r"200\s*m",                "200m"),
    (r"300\s*m",                "300m"),
    (r"400\s*m",                "400m"),
    (r"800\s*m",                "800m"),
    (r"1\s*000\s*m|1000\s*m",   "1000m"),
    (r"1\s*500\s*m|1500\s*m",   "1500m"),
    (r"3\s*000\s*m|3000\s*m",   "3000m"),
    (r"high\s+jump|saut.{0,5}hauteur",        "High Jump"),
    (r"pole\s+vault|saut.{0,5}perche",        "Pole Vault"),
    (r"long\s+jump|saut.{0,5}longueur",       "Long Jump"),
    (r"shot\s+put|lancer.{0,10}poids",        "Shot Put"),
    (r"triple\s+jump|triple\s+saut",          "Triple Jump"),
]

def normalize_disc(raw):
    raw = raw.strip()
    for pattern, name in DISC_MAP:
        if re.search(pattern, raw, re.IGNORECASE):
            return name
    return raw

def normalize_gender(raw):
    raw = raw.strip().lower()
    if re.match(r"(dames|femmes|women|frauen|damen|seniors?\s+fem\.?|fem\.?)$", raw):
        return "W"
    if re.match(r"(hommes|men|männer|herren|seniors?\s+masc\.?|masc\.?)$", raw):
        return "M"
    if raw in ("f", "w"):
        return "W"
    if raw in ("h", "m"):
        return "M"
    return None

# ─── Format detection ────────────────────────────────────────────────────────

def detect_format(text):
    """Returns 'tnf', 'seltec' or 'fla' based on PDF text."""
    # Track and Field 3.x software (2019–2026)
    if "Track and Field 3." in text or "Rank Bib Name YoB NPC" in text or "Rank Bib Name YoB NOC" in text or "Rank Bib Name Date of Birth NOC" in text:
        return "tnf"
    if "RgS.tartnr" in text or "Rk. BIB" in text or "NNaammee" in text:
        return "seltec"
    return "fla"

# ─── Section header detection ─────────────────────────────────────────────────
# Returns (discipline, gender, round_key) or None
# round_key: "final" | "final_a" | "final_b" | "heat" (heats → skip)

GENDER_FR = r"(?P<gender>Dames|Femmes|Hommes)"
GENDER_EN = r"(?P<gender>Women|Men)"
ROUND_FR  = r"(?P<round>Finale?\s*[AB]?|S[ée]rie\s*\d+|Tour\s*\d+|Final[e]?\s*[AB]?)"
ROUND_EN  = r"(?P<round>Final[e]?\s*[AB]?|Heat\s*\d+|Round\s*\d+)"

HEADER_PATTERNS = [
    # "60 m Dames - Finale A"  /  "60 m Haies Hommes - Série 2"
    re.compile(
        r"^(?P<disc>\d+\s*m(?:\s+Ha[ïi]es?|\s+Hurdles?)?)\s+"
        + GENDER_FR + r"\s*[-–]\s*" + ROUND_FR + r"\s*$", re.IGNORECASE),
    # "800 m Hommes Finale A"  (no dash)
    re.compile(
        r"^(?P<disc>\d+\s*m(?:\s+Ha[ïi]es?|\s+Hurdles?)?)\s+"
        + GENDER_FR + r"\s+" + ROUND_FR + r"\s*$", re.IGNORECASE),
    # "60 m Dames - Final"  (English round label)
    re.compile(
        r"^(?P<disc>\d+\s*m(?:\s+Ha[ïi]es?|\s+Hurdles?)?)\s+"
        + GENDER_FR + r"\s*[-–]\s*" + ROUND_EN + r"\s*$", re.IGNORECASE),
    # "1500 m Hommes"  (single-race, no round label)
    re.compile(
        r"^(?P<disc>\d+\s*m(?:\s+Ha[ïi]es?|\s+Hurdles?)?)\s+"
        + GENDER_FR + r"\s*$", re.IGNORECASE),
    # "High Jump Women" / "Pole Vault Men"
    re.compile(
        r"^(?P<disc>High\s+Jump|Pole\s+Vault|Long\s+Jump|Shot\s+Put|Triple\s+Jump"
        r"|Saut\s+en\s+hauteur|Saut\s+[àa]\s+la\s+perche|Saut\s+en\s+longueur"
        r"|Lancer\s+du\s+poids|Triple\s+saut)\s+"
        + GENDER_EN + r"\s*$", re.IGNORECASE),
    # "Saut en hauteur Dames" (French field events)
    re.compile(
        r"^(?P<disc>High\s+Jump|Pole\s+Vault|Long\s+Jump|Shot\s+Put|Triple\s+Jump"
        r"|Saut\s+en\s+hauteur|Saut\s+[àa]\s+la\s+perche|Saut\s+en\s+longueur"
        r"|Lancer\s+du\s+poids|Triple\s+saut)\s+"
        + GENDER_FR + r"\s*$", re.IGNORECASE),
]

def parse_round_key(round_str):
    if not round_str:
        return "final"
    r = round_str.strip().lower()
    if re.search(r"s[ée]rie|heat|round|tour", r):
        return "heat"
    if re.search(r"finale?\s*b|final\s*b", r):
        return "final_b"
    if re.search(r"finale?\s*a|final\s*a", r):
        return "final_a"
    return "final"

def parse_header(line):
    for pat in HEADER_PATTERNS:
        m = pat.match(line.strip())
        if m:
            disc = normalize_disc(m.group("disc"))
            gender = normalize_gender(m.group("gender"))
            round_key = parse_round_key(m.groupdict().get("round", ""))
            if disc and gender:
                return disc, gender, round_key
    return None

# ─── Result line parsing ───────────────────────────────────────────────────────

SKIP_LINE = re.compile(
    r"^(www\.|Page\s+\d+|Place\s+|Doss\.|7\.|8\.|9\.|10\.|11\.|12\.|13\.|14\.|15\.|16\.|"
    r"17\.|18\.|19\.|20\.|21\.|22\.|23\.|1\.|2\.|3\.|4\.|5\.|6\.|"
    r"Saturday|Sunday|Samedi|Dimanche|FLA\s|DUSSMANN|PEDUS|VECTIS|CMCM|indoor|Indoor)",
    re.IGNORECASE
)
SKIP_BREAKDOWN = re.compile(r"^\d+[,.]")  # high jump / PV breakdown tables
NOC_RE = re.compile(r"^[A-Z]{2,3}$")
PERF_RE = re.compile(
    r"^(\d+'\d+''[\d.]+|\d+''[\d.,]+|\d+[.,]\d+\s*m?|DNS|DNF|DQ|Disq|NM|ND|ABD|0)$",
    re.IGNORECASE
)

def clean_perf(raw):
    """Normalise performance string: 07''38 → 7.38, 1'50''64 → 1:50.64, 1,88 m → 1.88"""
    raw = raw.strip()
    if raw.upper() in ("DNS", "DNF", "DQ", "DISQ", "NM", "ND", "ABD"):
        return None  # skip

    # "0" = failed all attempts (field events), keep as 0
    if raw == "0":
        return "0"

    # Distance/height: "1,88 m" → "1.88"
    m = re.match(r"^(\d+)[,.](\d+)\s*m?$", raw)
    if m:
        return f"{m.group(1)}.{m.group(2)}"

    # Time with minutes: "1'50''64" → "1:50.64"
    m = re.match(r"^(\d+)'(\d+)''([\d.]+)$", raw)
    if m:
        return f"{m.group(1)}:{m.group(2)}.{m.group(3)}"

    # Time seconds only: "07''38" → "7.38"  (strip leading zero)
    m = re.match(r"^0?(\d+)''([\d.]+)$", raw)
    if m:
        return f"{m.group(1)}.{m.group(2)}"

    return raw

def parse_result_line(line):
    """Returns dict {rank, lastName, firstName, noc, result} or None."""
    line = line.strip()
    if not line:
        return None
    if SKIP_LINE.match(line):
        return None
    if SKIP_BREAKDOWN.match(line):
        return None

    tokens = line.split()
    if len(tokens) < 4:
        return None

    # Tokens must start with a digit (rank or bib)
    if not tokens[0].isdigit():
        return None

    # Find NOC position: 3-letter ALLCAPS, followed by a performance-like token
    noc_idx = None
    for i in range(2, len(tokens)):
        t = tokens[i]
        if NOC_RE.match(t) and i + 1 < len(tokens):
            next_t = tokens[i + 1]
            if PERF_RE.match(next_t) or next_t.upper() in ("DNS","DNF","DQ","DISQ","NM","ND","ABD","0"):
                noc_idx = i
                break
        # Also allow NOC at end with no performance (rare edge case)
        if NOC_RE.match(t) and i == len(tokens) - 1:
            noc_idx = i
            break

    if noc_idx is None:
        return None

    pre = tokens[:noc_idx]
    noc = tokens[noc_idx]
    post = tokens[noc_idx + 1:]

    # Remove qual from end of post (Q/q/r)
    while post and re.match(r"^[Qqr]$", post[-1]):
        post.pop()

    # Rank + bib
    rank = None
    bib_idx = 0
    if len(pre) >= 2 and pre[0].isdigit() and pre[1].isdigit():
        rank = int(pre[0])
        bib_idx = 1
    elif pre[0].isdigit():
        bib_idx = 0  # no rank (DNS etc.)

    name_tokens = pre[bib_idx + 1:]
    if not name_tokens:
        return None

    # If no rank, skip (DNS/DNF entries)
    if rank is None:
        return None

    # Split lastName / firstName: lastName = ALL_CAPS tokens, firstName = rest
    last_parts, first_parts = [], []
    in_last = True
    for t in name_tokens:
        cleaned = re.sub(r"[-.'`\"]", "", t)
        if in_last and cleaned and cleaned.isupper():
            last_parts.append(t)
        else:
            in_last = False
            first_parts.append(t)

    lastName = " ".join(last_parts)
    firstName = " ".join(first_parts)

    # Performance
    raw_perf = " ".join(post) if post else ""
    result = clean_perf(raw_perf) if raw_perf else None

    if result is None:
        return None  # DNS/DNF/etc → skip

    return {
        "rank": rank,
        "lastName": lastName,
        "firstName": firstName,
        "noc": noc,
        "result": result,
    }

# ─── SELTEC discipline/round normalisation ───────────────────────────────────

SELTEC_DISC_MAP = [
    (r"60\s*m\s+h[aäi]+es?",           "60m Hurdles"),
    (r"60\s*m\s+hurdles?",             "60m Hurdles"),
    (r"60\s*m\s+hürden",               "60m Hurdles"),
    (r"60\s*m",                        "60m"),
    (r"50\s*m",                        "50m"),
    (r"100\s*m",                       "100m"),
    (r"200\s*m",                       "200m"),
    (r"300\s*m",                       "300m"),
    (r"400\s*m",                       "400m"),
    (r"800\s*m",                       "800m"),
    (r"1[,. ]?000\s*m|1000\s*m",       "1000m"),
    (r"1[,. ]?500\s*m|1500\s*m",       "1500m"),
    (r"3[,. ]?000\s*m|3000\s*m",       "3000m"),
    # field events — French, English, German
    (r"hauteur|high\s*jump|hochsprung",              "High Jump"),
    (r"perche|pole\s*vault|stabhoch",                "Pole Vault"),
    (r"longueur|long\s*jump|weitsprung",             "Long Jump"),
    (r"poids|shot\s*put|kugel",                      "Shot Put"),
    (r"triple\s*jump|triple\s*saut|dreisprung",      "Triple Jump"),
]

def seltec_normalize_disc(raw):
    raw = raw.strip()
    for pattern, name in SELTEC_DISC_MAP:
        if re.search(pattern, raw, re.IGNORECASE):
            return name
    return normalize_disc(raw)

# SELTEC section header patterns
# e.g. "60 m Dames, Dames - Finale"  /  "Hauteur dames, Dames - Finale A"
# e.g. "60m Hommes, Hommes - A-/B-Final"  /  "60m, Women - Finale"  (2018)
SELTEC_HEADER_RE = re.compile(
    r"^(?P<disc>[^,]+?)"
    r"(?:,\s*(?:Dames|Hommes|Women|Men|Femmes))?"     # optional ", gender" after disc
    r"\s*[-–,]\s*"
    r"(?P<gender>Dames|Hommes|Women|Men|Femmes)"
    r"\s*[-–]\s*"
    r"(?P<round>.+?)\s*$",
    re.IGNORECASE
)

def parse_seltec_header(line):
    """Parse SELTEC format section header."""
    line = line.strip()
    m = SELTEC_HEADER_RE.match(line)
    if not m:
        return None
    disc_raw = m.group("disc").strip()
    gender = normalize_gender(m.group("gender"))
    round_raw = m.group("round").strip()

    disc = seltec_normalize_disc(disc_raw)
    round_key = parse_round_key(round_raw)

    # "A-/B-Final" or "A-/B-Finale" = contains both A and B → treat as needing sub-labels
    # NOTE: no re.IGNORECASE here — A/B final labels are always uppercase,
    # and lowercase "a" inside words like "Finale" must NOT match.
    if re.search(r"A-?/?B|A.*B", round_raw):
        round_key = "ab_combined"  # will be split by sub-labels

    if disc and gender:
        return disc, gender, round_key
    return None

SUB_LABEL_RE = re.compile(
    r"^(A-Final|B-Final|Final|Finale?\s*A|Finale?\s*B|Heat\s*\d+|Heats?\s*\d*)\s*$",
    re.IGNORECASE
)

def parse_sublabel(line):
    """Returns round_key from sub-labels like 'A-Final', 'B-Final', 'Final'."""
    m = SUB_LABEL_RE.match(line.strip())
    if not m:
        return None
    label = m.group(1).strip().lower()
    if re.search(r"a.?final|final.*a|finale.*a", label):
        return "final_a"
    if re.search(r"b.?final|final.*b|finale.*b", label):
        return "final_b"
    if re.search(r"heat", label):
        return "heat"
    return "final"

# ─── SELTEC result line parsing ───────────────────────────────────────────────

YOB_RE = re.compile(r"^(19[3-9]\d|20[012]\d)$")  # 1930–2029
NOC_SELTEC_RE = re.compile(r"^[A-Z]{1,4}$")

def clean_perf_seltec(raw):
    """Convert SELTEC performance to standard string."""
    raw = raw.strip()
    if raw.upper() in ("DNS", "DNF", "DQ", "DISQ", "DSQ", "NM", "ND", "ABD", "NH", "W.V.T.") or raw.lower() == "w.v.t.":
        return None
    if raw == "0":
        return "0"
    # "7,45" or "7.45"
    m = re.match(r"^(\d+)[,.](\d+)$", raw)
    if m:
        return f"{m.group(1)}.{m.group(2)}"
    # "2:01,85" or "2:01.85"
    m = re.match(r"^(\d+):(\d+)[,.](\d+)$", raw)
    if m:
        return f"{m.group(1)}:{m.group(2)}.{m.group(3)}"
    return raw

def parse_result_line_seltec(line):
    """Parse a SELTEC result line. Returns dict or None."""
    line = line.strip()
    if not line:
        return None
    if SKIP_LINE.match(line):
        return None

    tokens = line.split()
    if len(tokens) < 5:
        return None
    if not tokens[0].isdigit():
        return None

    rank = int(tokens[0])
    if not tokens[1].isdigit():
        return None

    # Find yob
    yob_idx = None
    for i in range(2, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None:
        return None

    name_tokens = tokens[2:yob_idx]
    if not name_tokens:
        return None

    # Split name: lastName (ALL_CAPS) then firstName
    last_parts, first_parts = [], []
    in_last = True
    for t in name_tokens:
        cleaned = re.sub(r"[-.'`\"]", "", t)
        if in_last and cleaned and cleaned.replace("1", "").replace("0", "").isupper() and re.search(r"[A-Z]", cleaned):
            last_parts.append(t)
        else:
            in_last = False
            first_parts.append(t)

    # After yob: find NOC (first 2-4 uppercase token)
    post_yob = tokens[yob_idx + 1:]
    noc = None
    noc_end = 0
    for i, t in enumerate(post_yob):
        if NOC_SELTEC_RE.match(t):
            noc = t  # keep taking; prefer last 2-3 letter one before performance
            noc_end = i
        else:
            break

    if not noc:
        return None

    # Remaining tokens after NOC block = club? + performance + qual
    perf_tokens = post_yob[noc_end + 1:]

    # Remove qual/position indicators from end (Q, q, "1./I", "2./II" etc.)
    while perf_tokens and re.match(r"^([Qq]|\d+\./[IVX]+)$", perf_tokens[-1]):
        perf_tokens.pop()

    if not perf_tokens:
        return None

    # Handle "1,85 m" → last two tokens, or just last token
    if perf_tokens[-1] == "m" and len(perf_tokens) >= 2:
        raw_perf = perf_tokens[-2] + " m"
    else:
        raw_perf = perf_tokens[-1]

    result = clean_perf_seltec(raw_perf)
    if result is None:
        return None

    return {
        "rank": rank,
        "lastName": " ".join(last_parts),
        "firstName": " ".join(first_parts),
        "noc": noc if len(noc) <= 3 else noc[:3],
        "yob": int(tokens[yob_idx]),
        "result": result,
    }

# ─── TNF format (Track and Field 3.x, 2019–2026) ─────────────────────────────

# Categories to SKIP (youth, disability, relay, special)
TNF_SKIP_RE = re.compile(
    r"\b(U\d{2}|Junior|Cadet|Youth|Scolaires?|Débutants?|ScF|ScM|[A-Z]{1,2}\d{2}[A-Z]{0,2}"
    r"|Special\s+Olympics?|Ludiques?|Benjamins?|F-\d+|T-\d+|Relay|Relais|4x|5x"
    r"|Mixed|Mixte|Para|Masters?)\b",
    re.IGNORECASE,
)
# Continuation pages (same event split across PDF pages) → skip
TNF_CONTINUATION_RE = re.compile(r"-\s*Continuation\b", re.IGNORECASE)

# Header: "disc, gender [qualifiers] [date]"
# disc may include "BRONZE Label", weight in parentheses, etc.
TNF_HEADER_RE = re.compile(
    r"^(?P<disc>[^,]+?)"
    r"(?:\s+BRONZE\s+Label)?"         # optional "BRONZE Label" suffix
    r",\s*"
    r"(?P<gender>Women|Men|Dames|Hommes|Femmes|Seniors?\s+fem\.?|Seniors?\s+masc\.?)"
    r"(?:\s+\([^)]*\))?"              # optional "(7.26kg)" etc.
    r"(?:\s+\d{2}[./]\d{2}[./]\d{4}|\s+\d{2}\s+[A-Z]{3}\s+\d{4})?"  # optional date
    r"(?:\s*/\s*\d{2}:\d{2})?\s*$",  # optional time
    re.IGNORECASE,
)

# Round labels for TNF format
TNF_ROUND_RE = re.compile(
    r"^(?P<round>A\s+Final|B\s+Final|Final|Preliminary\s+Heat\s*\d*|Heat\s*\d*(?:\s+of\s+\d+)?"
    r"|Timed\s+Heat(?:s)?\s*\d*(?:\s+of\s+\d+)?|Heats?|Vorlauf)\s*(?:of\s+\d+)?"
    r"(?:\s+\d{2}[./]\d{2}[./]\d{4}|\s+\d{2}\s+[A-Z]{3}\s+\d{4})?"
    r"(?:\s*/\s*\d{2}:\d{2})?\s*$",
    re.IGNORECASE,
)

def parse_tnf_header(line):
    """
    Parse TNF section header.
    Returns:
      (disc, gender, 'new_section') — valid event header
      'continuation'               — continuation page, merge into last section
      'skip'                       — header matched but event should be ignored (youth/relay/etc.)
      None                         — line is NOT a header at all
    """
    line = line.strip()
    if TNF_CONTINUATION_RE.search(line):
        return "continuation"
    m = TNF_HEADER_RE.match(line)
    if not m:
        return None  # not a header
    disc_raw = m.group("disc").strip()
    gender_raw = m.group("gender").strip()
    # Skip youth/disability/relay/special categories
    if TNF_SKIP_RE.search(disc_raw) or TNF_SKIP_RE.search(gender_raw):
        return "skip"
    disc = seltec_normalize_disc(disc_raw)
    gender = normalize_gender(gender_raw)
    if disc and gender:
        return disc, gender, "new_section"
    return "skip"

def parse_tnf_round(line):
    """Parse TNF round label line. Returns round_key or None."""
    m = TNF_ROUND_RE.match(line.strip())
    if not m:
        return None
    label = m.group("round").strip().lower()
    if re.search(r"a\s*final", label):
        return "final_a"
    if re.search(r"b\s*final", label):
        return "final_b"
    if re.search(r"^final", label):
        return "final"
    # "Timed Heats" = single-round timed event (no separate final) → treat as final
    if re.search(r"timed\s+heat", label):
        return "timed_final"
    # Preliminary Heat, Heat N, Heats, Vorlauf → skip
    return "heat"

# Lines to skip in TNF result parsing
TNF_SKIP_LINE_RE = re.compile(
    r"^(Rank\s+Bib|Dataservice|Printed|CMCM|Meeting|Luxembourg|"
    r"Record|Meilleure|New\s+National|First\s+\d|Rule\s+\d|"
    r"[-xXOoP]\s|[-\s]+T\d\s|Intermediate|SB$|PB$|WR$|NR$|"
    r"[\d.]+\s+[\d.]+\s+[\d.]+)",  # field event attempts row
    re.IGNORECASE,
)

# Performance/mark indicators to strip from end of line
MARK_INDICATOR_RE = re.compile(
    r"^(=?(?:SB|PB|WR|NR|MR|CR|AR|ER)|Q|q|\d+\./[IVX]+)$",
    re.IGNORECASE,
)

def parse_result_line_tnf(line):
    """Parse TNF result line. Returns dict or None."""
    line = line.strip()
    if not line:
        return None
    if TNF_SKIP_LINE_RE.match(line):
        return None
    # Skip field-event attempt rows (x, -, numbers with spaces)
    if re.match(r"^[x\-][\s\dx.,\-]+$", line, re.IGNORECASE):
        return None

    tokens = line.split()
    if len(tokens) < 4:
        return None
    if not tokens[0].isdigit():
        return None

    rank = int(tokens[0])
    # tokens[1] must be bib (digit)
    if not tokens[1].isdigit():
        return None

    # Find YoB (4-digit year, 1930–2029)
    yob_idx = None
    for i in range(2, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break
    if yob_idx is None:
        return None

    name_tokens = tokens[2:yob_idx]
    if not name_tokens:
        return None

    # Split name: ALL_CAPS lastName then Title_Case firstName
    last_parts, first_parts = [], []
    in_last = True
    for t in name_tokens:
        cleaned = re.sub(r"[-.'`\"]", "", t)
        if in_last and cleaned and cleaned.replace("1","").replace("0","").isupper() and re.search(r"[A-Z]", cleaned):
            last_parts.append(t)
        else:
            in_last = False
            first_parts.append(t)

    # After YoB: NOC (1–3 uppercase letters)
    post_yob = tokens[yob_idx + 1:]
    noc = None
    noc_end = -1
    for i, t in enumerate(post_yob):
        if re.match(r"^[A-Z]{2,4}$", t):
            noc = t
            noc_end = i
        else:
            break
    if not noc:
        return None

    # Remaining = [club?] + result + [marks]
    perf_tokens = post_yob[noc_end + 1:]
    # Strip mark indicators from end (SB, PB, Q, q, "1./I", etc.)
    while perf_tokens and MARK_INDICATOR_RE.match(perf_tokens[-1]):
        perf_tokens.pop()
    if not perf_tokens:
        return None

    # Handle "1,85 m" (field events)
    if len(perf_tokens) >= 2 and perf_tokens[-1] == "m":
        raw_perf = perf_tokens[-2] + " m"
    else:
        raw_perf = perf_tokens[-1]

    result = clean_perf_seltec(raw_perf)
    if result is None:
        return None

    return {
        "rank": rank,
        "lastName": " ".join(last_parts),
        "firstName": " ".join(first_parts),
        "noc": noc if len(noc) <= 3 else noc[:3],
        "result": result,
    }

# ─── PDF → sections ────────────────────────────────────────────────────────────

def extract_sections(pdf_path, debug=False):
    """
    Returns list of {disc, gender, round_key, rows[]}.
    rows = list of parsed result dicts.
    """
    # Detect format from full text
    all_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            all_text += (page.extract_text() or "") + "\n"
    fmt = detect_format(all_text)
    if debug:
        print(f"[debug] format detected: {fmt}")

    sections = []
    current = None
    pending_disc_gender = None  # for TNF: header seen, waiting for round label

    for line in all_text.splitlines():
        line = line.strip()
        if not line:
            continue

        if fmt == "tnf":
            # 1) Check for a new discipline header
            hdr = parse_tnf_header(line)
            if hdr == "continuation":
                # Append continuation rows to the last section for the active disc/gender
                if pending_disc_gender:
                    d, g = pending_disc_gender
                    current = next(
                        (s for s in reversed(sections) if s["disc"] == d and s["gender"] == g),
                        None,
                    )
                    pending_disc_gender = None  # don't create a new section for the upcoming round label
                else:
                    # Still appending to whatever current is
                    pass
                if debug:
                    print(f"[debug] continuation → appending to '{current['disc'] if current else 'None'}'")
                continue
            if hdr == "skip":
                # Recognised header but skipped (youth/relay/disability) — reset state
                current = None
                pending_disc_gender = None
                if debug:
                    print(f"[debug] TNF skip '{line}'")
                continue
            if hdr is not None:
                disc, gender, _ = hdr
                current = None
                pending_disc_gender = (disc, gender)
                if debug:
                    print(f"[debug] TNF header '{line}' → disc={disc}, gender={gender}")
                continue

            # 2) Check for round label
            rk = parse_tnf_round(line)
            if rk is not None:
                if pending_disc_gender:
                    disc, gender = pending_disc_gender
                    pending_disc_gender = None  # consume — next round label for same disc won't duplicate
                    if rk != "heat":
                        stored_rk = "final" if rk == "timed_final" else rk
                        current = {"disc": disc, "gender": gender, "round_key": stored_rk, "rows": []}
                        sections.append(current)
                        if debug:
                            print(f"[debug] TNF round '{line}' → {stored_rk} for {disc} {gender}")
                    else:
                        current = None  # heats → don't collect
                        if debug:
                            print(f"[debug] TNF heat '{line}' → skip")
                # If pending_disc_gender is None: we're either in continuation mode (current already set)
                # or after a skipped header (current is None). Either way, don't create a new section.
                continue

            # 3) Try to collect result row
            # Field events may have no round label — create implicit "final" on first result row
            if current is None and pending_disc_gender:
                r_test = parse_result_line_tnf(line)
                if r_test:
                    disc, gender = pending_disc_gender
                    pending_disc_gender = None
                    current = {"disc": disc, "gender": gender, "round_key": "final", "rows": [r_test]}
                    sections.append(current)
                    if debug:
                        print(f"[debug] implicit final for {disc} {gender}")
                continue

            if current is not None:
                r = parse_result_line_tnf(line)
                if r:
                    current["rows"].append(r)

        elif fmt == "seltec":
            # Check sub-labels first (A-Final, B-Final, Final, Heat N)
            sub = parse_sublabel(line)
            if sub is not None:
                if current is not None and current.get("_ab_combined"):
                    # Create a new sub-section under the ab_combined parent
                    new_sec = {"disc": current["disc"], "gender": current["gender"],
                               "round_key": sub, "rows": [], "_ab_combined": True}
                    sections.append(new_sec)
                    current = new_sec
                    if debug:
                        print(f"[debug] sub-label '{line}' → {sub} (ab_combined parent)")
                else:
                    if debug:
                        print(f"[debug] sub-label '{line}' → {sub} (ignored, not ab_combined)")
                continue

            header = parse_seltec_header(line)
            if header:
                disc, gender, round_key = header
                is_ab = (round_key == "ab_combined")
                if is_ab:
                    round_key = "final_a"  # placeholder; real key set by sub-labels
                current = {"disc": disc, "gender": gender, "round_key": round_key,
                           "rows": [], "_ab_combined": is_ab}
                sections.append(current)
                if debug:
                    print(f"[debug] header '{line}' → disc={disc}, gender={gender}, rk={round_key}, ab={is_ab}")
                continue

            if current is not None:
                r = parse_result_line_seltec(line)
                if r:
                    current["rows"].append(r)

        else:  # fla format
            header = parse_header(line)
            if header:
                disc, gender, round_key = header
                current = {"disc": disc, "gender": gender, "round_key": round_key, "rows": []}
                sections.append(current)
                if debug:
                    print(f"[debug] header '{line}' → disc={disc}, gender={gender}, rk={round_key}")
                continue

            if current is not None:
                r = parse_result_line(line)
                if r:
                    current["rows"].append(r)

    return sections

# ─── Combine A/B finals → single ranked list ──────────────────────────────────

def combine_ab_finals(a_rows, b_rows):
    """
    Finale A athletes have faster times → overall ranks 1..N_A
    Finale B athletes → ranks N_A+1..N_A+N_B
    """
    combined = []
    for i, r in enumerate(a_rows, 1):
        combined.append({**r, "rank": i})
    offset = len(a_rows)
    for i, r in enumerate(b_rows, 1):
        combined.append({**r, "rank": offset + i})
    return combined

# ─── Build year results ────────────────────────────────────────────────────────

def build_year_results(year, pdf_path, debug=False):
    sections = extract_sections(pdf_path, debug=debug)

    # Index sections by (disc, gender) — keep the version with most rows if duplicates
    from collections import defaultdict
    by_dg = defaultdict(dict)  # (disc, gender) → {round_key: rows}
    for s in sections:
        key = (s["disc"], s["gender"])
        rk = s["round_key"]
        existing = by_dg[key].get(rk, [])
        if len(s["rows"]) >= len(existing):
            by_dg[key][rk] = s["rows"]

    results = []
    date = None

    # If both 50m and 60m exist for the same gender, drop 50m (60m is canonical)
    for g in ("W", "M"):
        if ("60m", g) in by_dg and ("50m", g) in by_dg:
            del by_dg[("50m", g)]

    for (disc, gender), rounds in by_dg.items():
        # Skip if only heats (should not happen after heat-key is "heat")
        all_keys = set(rounds.keys())
        if all_keys == {"heat"}:
            continue

        if "final_a" in rounds and "final_b" in rounds:
            # A+B finals → A athletes first then B (A+B always beats a lone "final")
            rows = combine_ab_finals(rounds["final_a"], rounds["final_b"])
        elif "final" in rounds:
            rows = rounds["final"]
        elif "final_a" in rounds:
            rows = rounds["final_a"]
        elif "final_b" in rounds:
            rows = rounds["final_b"]
        else:
            # No final found (only heats) → skip
            continue

        for r in rows:
            results.append({
                "rank": r["rank"],
                "lastName": r["lastName"],
                "firstName": r["firstName"],
                "noc": r["noc"],
                "result": r["result"],
                "discipline": disc,
                "gender": gender,
                "year": year,
                "date": f"{year}-01-01",  # placeholder, update manually if needed
                "notes": "",
            })

    return results

# ─── Save one year to JSON (incremental) ──────────────────────────────────────

def save_year(year, results):
    """Load existing JSON, update this year, write back immediately."""
    if OUTPUT.exists():
        with open(OUTPUT) as f:
            all_results = json.load(f)
    else:
        all_results = {}

    all_results[str(year)] = results
    all_results = dict(sorted(all_results.items(), key=lambda x: int(x[0])))

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print(f"  ✓ Saved {year} → {OUTPUT}")


def print_summary(results):
    from collections import Counter
    disc_counts = Counter(f"{r['discipline']} {r['gender']}" for r in results)
    print(f"  Found {len(results)} results across {len(disc_counts)} discipline/gender combos:")
    for k, v in sorted(disc_counts.items()):
        winner = next((r for r in results if f"{r['discipline']} {r['gender']}" == k and r['rank'] == 1), None)
        winner_name = f"{winner['lastName']} {winner['firstName']}" if winner else "?"
        print(f"    {k}: {v} entries — winner: {winner_name}")


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    preview  = "--preview"  in args
    debug    = "--debug"    in args
    force    = "--force"    in args   # re-parse even if year already in JSON
    args = [a for a in args if not a.startswith("--")]

    if not args:
        print("Usage:")
        print("  python3 scripts/parse-pdf-results.py <year>          # parse one year")
        print("  python3 scripts/parse-pdf-results.py all             # parse all years (skips already done)")
        print("  python3 scripts/parse-pdf-results.py all --force     # re-parse everything")
        print("  Add --preview to dry-run without saving")
        print("  Add --debug   to trace headers")
        print("Years available:", sorted(PDF_MAP.keys()))
        sys.exit(1)

    # Decide which years to process
    if args[0].lower() == "all":
        years = sorted(PDF_MAP.keys())
    else:
        years = [int(a) for a in args]

    # Load existing JSON once (to check which years are already done)
    existing = {}
    if not force and OUTPUT.exists():
        with open(OUTPUT) as f:
            existing = json.load(f)

    for year in years:
        if year not in PDF_MAP:
            print(f"⚠️  No PDF mapped for year {year} — skipping")
            continue

        if not force and str(year) in existing:
            print(f"  ⏭  {year} already in JSON — skipping (use --force to re-parse)")
            continue

        pdf_path = PDF_DIR / PDF_MAP[year]
        if not pdf_path.exists():
            print(f"⚠️  PDF not found: {pdf_path} — skipping")
            continue

        print(f"\n── {year} ──────────────────────────────────────────")
        print(f"Parsing {pdf_path.name}...")
        results = build_year_results(year, pdf_path, debug=debug)
        print_summary(results)

        if preview:
            print("  [PREVIEW — not saved]")
        else:
            save_year(year, results)

    if not preview and len(years) > 1:
        print(f"\n✅ Done. Output: {OUTPUT}")

if __name__ == "__main__":
    main()
