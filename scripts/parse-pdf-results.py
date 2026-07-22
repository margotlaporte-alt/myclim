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
import unicodedata
from pathlib import Path

import pdfplumber

# ─── Config ──────────────────────────────────────────────────────────────────

PDF_DIR_CANDIDATES = [
    Path.home() / "Downloads" / "Indoor Meeting",
    Path.home() / "Downloads",
]

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

def _strip_accents(value):
    return "".join(
        ch for ch in unicodedata.normalize("NFD", value or "")
        if unicodedata.category(ch) != "Mn"
    )

def find_pdf_path(year):
    name = PDF_MAP[year]
    for base in PDF_DIR_CANDIDATES:
        candidate = base / name
        if candidate.exists():
            return candidate
    return PDF_DIR_CANDIDATES[0] / name

def normalize_gender(raw):
    raw = raw.strip().lower()
    if re.match(r"(dames|femmes|women|frauen|damen|seniors?\s+fem\.?|fem\.?)$", raw):
        return "W"
    if re.match(r"(hommes|messieurs|men|männer|herren|seniors?\s+masc\.?|masc\.?)$", raw):
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


# ─── 2003-specific parsing ────────────────────────────────────────────────────

LOCAL_CLUB_CODES = {
    "CAB", "CAD", "CAEG", "CAS", "CELTIC", "CSL", "FOLA", "RBUAP",
}

COUNTRY_TOKEN_TO_NOC = {
    "AUT": "AUT",
    "AUSTRALIE": "AUS",
    "AUS": "AUS",
    "BEL": "BEL",
    "BRA": "BRA",
    "BRESIL": "BRA",
    "BRÉSIL": "BRA",
    "DEU": "DEU",
    "FRA": "FRA",
    "GER": "DEU",
    "GHA": "GHA",
    "GHANA": "GHA",
    "KEN": "KEN",
    "KENYA": "KEN",
    "MAR": "MAR",
    "NED": "NED",
    "NOR": "NOR",
    "RUS": "RUS",
    "RUSSIE": "RUS",
    "SUI": "SUI",
    "TAN": "TAN",
    "TANZANIA": "TAN",
}

ROUND_2003_SUBHEADER_RE = re.compile(r"^(?P<label>(?:\d+(?:re|me)\s+série|SERIE\s+\d+))$", re.IGNORECASE)
YOUTH_2003_RE = re.compile(r"\b(DÉBUTANT(?:ES|S)?|DEBUTANT(?:ES|S)?|SCOLAIRES?|MINIMES?)\b", re.IGNORECASE)
RELAY_2003_RE = re.compile(r"\b(Relais|4\s*x\s*200)\b", re.IGNORECASE)
STATUS_2003_MAP = {
    "ABAND.": "ABN",
    "ABOND.": "ABN",
    "ABN": "ABN",
    "ABD": "ABN",
    "DISQ.": "DSQ",
    "DISQ": "DSQ",
    "DQ": "DSQ",
    "DSQ": "DSQ",
    "DNS": "DNS",
    "DNF": "DNF",
    "NM": "NM",
    "ND": "ND",
}
FIELD_DISCIPLINES = {"High Jump", "Pole Vault", "Long Jump", "Shot Put", "Triple Jump"}

DISC_2003_MAP = [
    (r"60\s*m\s*haies", "60m Hurdles"),
    (r"60\s*m\b", "60m"),
    (r"200\s*m\b", "200m"),
    (r"800\s*m\b", "800m"),
    (r"1500\s*m\b|1\s*500\s*m\b", "1500m"),
    (r"perche", "Pole Vault"),
    (r"hauteur", "High Jump"),
    (r"longueur", "Long Jump"),
    (r"poids", "Shot Put"),
]

def normalize_disc_2003(raw):
    normalized = raw.strip()
    for pattern, label in DISC_2003_MAP:
        if re.search(pattern, normalized, re.IGNORECASE):
            return label
    return normalize_disc(normalized)

def normalize_status_2003(raw):
    key = _strip_accents(str(raw or "").strip().upper()).replace(" ", "")
    return STATUS_2003_MAP.get(key)

def normalize_perf_2003(raw):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    status = normalize_status_2003(raw)
    if status:
        return status, status

    token = raw.replace(" ", "")

    m = re.match(r"^(\d+)''(\d+)'(\d+)$", token)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    m = re.match(r"^(\d+)''(\d+)$", token)
    if m:
        return f"{int(m.group(1))}.{m.group(2)}", "OK"

    m = re.match(r"^(\d+),(\d+)$", token)
    if m:
        return f"{m.group(1)}.{m.group(2)}", "OK"

    return raw, "OK"

def resolve_noc_and_club_2003(raw_token):
    token = str(raw_token or "").strip()
    if not token:
        return "", ""

    upper = token.upper()
    accentless = _strip_accents(upper)

    if upper in LOCAL_CLUB_CODES or accentless in LOCAL_CLUB_CODES:
        return "LUX", upper

    noc = COUNTRY_TOKEN_TO_NOC.get(upper) or COUNTRY_TOKEN_TO_NOC.get(accentless)
    if noc:
        return noc, ""

    if len(upper) == 3 and upper.isalpha():
        return upper, ""

    return "LUX", upper

def parse_result_line_2003(line):
    tokens = line.split()
    if len(tokens) < 4 or not tokens[0].isdigit():
        return None

    rank = int(tokens[0])
    raw_result = tokens[-1]
    raw_club = tokens[-2]
    name_tokens = tokens[1:-2]
    if not name_tokens:
        return None

    last_parts, first_parts = [], []
    in_last = True
    for token in name_tokens:
        cleaned = re.sub(r"[-.'`\"]", "", _strip_accents(token))
        if in_last and cleaned and cleaned.isupper():
            last_parts.append(token)
        else:
            in_last = False
            first_parts.append(token)

    last_name = " ".join(last_parts).strip()
    first_name = " ".join(first_parts).strip()
    if not last_name:
        return None

    result, status = normalize_perf_2003(raw_result)
    noc, club = resolve_noc_and_club_2003(raw_club)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "rawClub": raw_club,
        "result": result,
        "rawResult": raw_result,
        "status": status,
    }

def parse_event_header_2003(line):
    text = line.strip()
    if not text or YOUTH_2003_RE.search(text) or RELAY_2003_RE.search(text):
        return None

    round_value = "Final"
    if re.match(r"^finale?\s*-", text, re.IGNORECASE):
        text = re.sub(r"^finale?\s*-\s*", "", text, flags=re.IGNORECASE).strip()
    else:
        round_value = None

    m = re.match(r"^(?P<gender>DAMES|MESSIEURS)\s*(?:/\s*|\s+)(?P<disc>.+?)$", text, re.IGNORECASE)
    if not m:
        return None

    gender = normalize_gender(m.group("gender"))
    disc_raw = m.group("disc").strip()
    disc_clean = re.sub(r"\s+", " ", disc_raw)
    final_group = None
    heat = None

    heat_match = re.search(r"(?:-|/)\s*(\d+)(?:re|me)\s+série$", disc_clean, re.IGNORECASE)
    if heat_match:
        heat = heat_match.group(1)
        round_value = "Heat"
        disc_clean = re.sub(r"\s*(?:-|/)\s*\d+(?:re|me)\s+série$", "", disc_clean, flags=re.IGNORECASE).strip()

    final_group_match = re.search(r"\b([AB12])\s*$", disc_clean)
    if final_group_match and normalize_disc_2003(disc_clean[:-1].strip()) == "800m":
        final_group = final_group_match.group(1)
        round_value = "Final"
        disc_clean = disc_clean[:-1].strip()

    discipline = normalize_disc_2003(disc_clean)
    if not discipline or not gender:
        return None

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value or "Final",
        "heat": heat or (final_group or ""),
        "finalGroup": final_group or "",
        "rawHeader": text,
    }

def section_sort_key(entry):
    value = entry["result"]
    if entry.get("status") and entry["status"] != "OK":
        return (1, float("inf"))
    if entry["discipline"] in FIELD_DISCIPLINES:
        return (0, -float(value))
    if ":" in value:
        minutes, seconds = value.split(":")
        return (0, int(minutes) * 60 + float(seconds))
    return (0, float(value))

def build_year_results_2003(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_text in page_texts:
        for raw_line in page_text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if line.startswith("4me FLA MEETING") or line.startswith("RÉSULTATS ") or line.startswith("place "):
                if line.startswith("RÉSULTATS "):
                    current = None
                continue
            if line.startswith("Résultats "):
                current = None
                continue

            if YOUTH_2003_RE.search(line) or RELAY_2003_RE.search(line):
                current = None
                continue

            header = parse_event_header_2003(line)
            if header:
                current = {**header, "rows": []}
                sections.append(current)
                continue

            sub = ROUND_2003_SUBHEADER_RE.match(line)
            if sub and current and current["round"] == "Heat":
                heat = re.search(r"(\d+)", sub.group("label")).group(1)
                current = {
                    **{k: v for k, v in current.items() if k != "rows"},
                    "heat": heat,
                    "rows": [],
                }
                sections.append(current)
                continue

            parsed = parse_result_line_2003(line)
            if not parsed or not current:
                continue

            current["rows"].append(parsed)

    edition_date = "2003-01-25"
    results = []

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = "Final" if section["round"] == "Heat" else ""
        for row in section["rows"]:
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": "",
            })

    ab_groups = {}
    for entry in results:
        if entry["round"] == "Final" and entry["heat"] in {"A", "B"}:
            ab_groups.setdefault((entry["discipline"], entry["gender"]), []).append(entry)

    for grouped_entries in ab_groups.values():
        ordered = sorted(grouped_entries, key=section_sort_key)
        for index, entry in enumerate(ordered, start=1):
            entry["rank"] = index

    return results


# ─── 2004-specific parsing ────────────────────────────────────────────────────

HEADER_2004_RE = re.compile(
    r"^(?P<disc>60\s*m\s+HURDLES|60\s*m|200\s*m|400\s*m|800\s*m|1000\s*m|POLE\s+VAULT|LONG\s+JUMP)\s+"
    r"(?P<gender>WOMEN|MEN)"
    r"(?:\s*(?P<suffix>\(HEATS\)|FINAL(?:\s+[AB])?|HEAT\s+\d+|[AB]))?\s*$",
    re.IGNORECASE,
)

DISC_2004_MAP = [
    (r"60\s*m\s+hurdles", "60m Hurdles"),
    (r"60\s*m\b", "60m"),
    (r"200\s*m\b", "200m"),
    (r"400\s*m\b", "400m"),
    (r"800\s*m\b", "800m"),
    (r"1000\s*m\b|1\s*000\s*m\b", "1000m"),
    (r"pole\s+vault", "Pole Vault"),
    (r"long\s+jump", "Long Jump"),
    (r"high\s+jump", "High Jump"),
]

STATUS_2004_MAP = {
    "DQ": "DSQ",
    "DNS": "DNS",
    "DNF": "DNF",
}

COUNTRY_TOKEN_TO_NOC_2004 = {
    **COUNTRY_TOKEN_TO_NOC,
    "AUT": "AUT",
    "BOT": "BOT",
    "CZE": "CZE",
    "GRE": "GRE",
    "KEN": "KEN",
    "LUX": "LUX",
    "POL": "POL",
    "SUI": "SUI",
    "UGA": "UGA",
}


def normalize_disc_2004(raw):
    normalized = re.sub(r"\s+", " ", raw.strip())
    for pattern, label in DISC_2004_MAP:
        if re.search(pattern, normalized, re.IGNORECASE):
            return label
    return normalize_disc(normalized)


def normalize_status_2004(raw):
    key = _strip_accents(str(raw or "").strip().upper()).replace(" ", "")
    return STATUS_2004_MAP.get(key)


def normalize_perf_2004(raw):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    status = normalize_status_2004(raw)
    if status:
        return status, status

    token = raw.replace(" ", "")

    m = re.match(r"^(\d+)'(\d+)''(\d+)$", token)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    m = re.match(r"^(\d+)''(\d+)$", token)
    if m:
        return f"{int(m.group(1))}.{m.group(2)}", "OK"

    m = re.match(r"^(\d+),(\d+)m?$", token, re.IGNORECASE)
    if m:
        return f"{m.group(1)}.{m.group(2)}", "OK"

    return raw, "OK"


def normalize_noc_2004(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2004.get(token) or COUNTRY_TOKEN_TO_NOC_2004.get(accentless) or token


def parse_event_header_2004(line, page_no, special_state):
    text = re.sub(r"\s+", " ", line.strip())
    if not text:
        return None

    if page_no == 14 and text.upper() == "LONG JUMP MEN":
        special_state["page14_long_jump_men_count"] = special_state.get("page14_long_jump_men_count", 0) + 1
        occurrence = special_state["page14_long_jump_men_count"]
        if occurrence == 1:
            return {
                "discipline": "High Jump",
                "gender": "W",
                "round": "Final",
                "heat": "",
                "finalGroup": "",
                "autoSplitHeats": False,
                "rawHeader": text,
            }
        return {
            "discipline": "Long Jump",
            "gender": "M",
            "round": "Final",
            "heat": "",
            "finalGroup": "",
            "autoSplitHeats": False,
            "rawHeader": text,
        }

    m = HEADER_2004_RE.match(text)
    if not m:
        return None

    discipline = normalize_disc_2004(m.group("disc"))
    gender = normalize_gender(m.group("gender"))
    suffix = (m.group("suffix") or "").strip()

    round_value = "Final"
    heat = ""
    final_group = ""
    auto_split_heats = False

    if suffix.upper() == "(HEATS)":
        round_value = "Heat"
        heat = "1"
        auto_split_heats = True
    elif re.match(r"^HEAT\s+\d+$", suffix, re.IGNORECASE):
        round_value = "Timed Final"
        heat = re.search(r"(\d+)", suffix).group(1)
    elif re.match(r"^FINAL\s+[AB]$", suffix, re.IGNORECASE):
        round_value = "Final"
        final_group = suffix.split()[-1].upper()
        heat = final_group
    elif suffix.upper() in {"A", "B"}:
        round_value = "Final"
        final_group = suffix.upper()
        heat = final_group
    elif suffix.upper() == "FINAL" or not suffix:
        round_value = "Final"

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "autoSplitHeats": auto_split_heats,
        "rawHeader": text,
    }


def parse_result_line_2004(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if tokens[0].isdigit():
        rank = int(tokens[0])
        start_index = 1

    qualification = ""
    if tokens[-1].upper() == "Q":
        qualification = tokens[-1].upper()
        tokens = tokens[:-1]

    if len(tokens[start_index:]) < 4:
        return None

    if tokens[-1].lower() == "m":
        raw_result = f"{tokens[-2]} m"
        bib_token = tokens[-3]
        noc_token = tokens[-4]
        name_tokens = tokens[start_index:-4]
    else:
        raw_result = tokens[-1]
        bib_token = tokens[-2]
        noc_token = tokens[-3]
        name_tokens = tokens[start_index:-3]

    if not name_tokens:
        return None

    last_parts, first_parts = [], []
    in_last = True
    for token in name_tokens:
        cleaned = re.sub(r"[-.'`\"]", "", _strip_accents(token))
        if in_last and cleaned and cleaned.isupper():
            last_parts.append(token)
        else:
            in_last = False
            first_parts.append(token)

    last_name = " ".join(last_parts).strip()
    first_name = " ".join(first_parts).strip()
    if not last_name:
        return None

    result, status = normalize_perf_2004(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2004(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
    }


def build_year_results_2004(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    special_state = {"page14_long_jump_men_count": 0}

    for page_no, page_text in enumerate(page_texts, start=1):
        if page_no < 10:
            continue

        for raw_line in page_text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if line.startswith("www.fla.lu") or line.startswith("2. FLA INDOOR MEETING") or line.startswith("24.01.2004") or line.startswith("Place "):
                current = None if line.startswith("www.fla.lu") else current
                continue

            header = parse_event_header_2004(line, page_no, special_state)
            if header:
                current = {**header, "rows": []}
                sections.append(current)
                continue

            parsed = parse_result_line_2004(line)
            if not parsed or not current:
                continue

            if current["autoSplitHeats"] and current["rows"] and parsed["sectionRank"] == 1:
                next_heat = str(int(current["heat"] or "1") + 1)
                current = {
                    **{k: v for k, v in current.items() if k != "rows"},
                    "heat": next_heat,
                    "rows": [],
                }
                sections.append(current)

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1

            current["rows"].append(parsed)

    edition_date = "2004-01-24"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = ""
        if section["round"] == "Heat":
            linked_round = "Final"
        elif section["round"] == "Final" and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in section["rows"]:
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": "",
            })

    timed_final_groups = {}
    for entry in results:
        if entry["round"] == "Timed Final":
            timed_final_groups.setdefault((entry["discipline"], entry["gender"], "timed"), []).append(entry)

    for key, grouped_entries in timed_final_groups.items():
        ordered = sorted(grouped_entries, key=section_sort_key)
        for index, entry in enumerate(ordered, start=1):
            entry["rank"] = index

    return results


# ─── 2005-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2005 = {
    "Perche Dames": ("Pole Vault", "W"),
    "Perche Hommes": ("Pole Vault", "M"),
    "Longueur Hommes": ("Long Jump", "M"),
    "Hauteur Dames": ("High Jump", "W"),
    "Poids Dames": ("Shot Put", "W"),
}

TRACK_HEADER_2005_RE = re.compile(
    r"^(?P<disc>60\s*m(?:\s+Haies)?|200\s*m|800\s*m|1500\s*m)\s+"
    r"(?P<gender>Dames|Hommes)\s*"
    r"(?:-\s*(?P<label>[^()]+)|\((?P<group>[AB])\))\s*$",
    re.IGNORECASE,
)

STATUS_2005_MAP = {
    "DNS": "DNS",
    "DNF": "DNF",
    "DISP.": "DSP",
    "DISP": "DSP",
}

COUNTRY_TOKEN_TO_NOC_2005 = {
    **COUNTRY_TOKEN_TO_NOC_2004,
    "BEL": "BEL",
    "BLR": "BLR",
    "BRA": "BRA",
    "CZE": "CZE",
    "GHA": "GHA",
    "KEN": "KEN",
    "LUX": "LUX",
    "MAD": "MAD",
    "MAR": "MAR",
    "NED": "NED",
    "POL": "POL",
    "RSA": "RSA",
    "SLO": "SLO",
    "SUI": "SUI",
    "SWE": "SWE",
}


def normalize_disc_2005(raw):
    text = re.sub(r"\s+", " ", str(raw or "").strip())
    text = text.replace("Haies", "Hurdles")
    return normalize_disc(text)


def normalize_status_2005(raw):
    key = _strip_accents(str(raw or "").strip().upper()).replace(" ", "")
    return STATUS_2005_MAP.get(key)


def normalize_perf_2005(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if field_event and raw in {"0,00", "0.00", "0"}:
        return "NM", "NM"

    status = normalize_status_2005(raw)
    if status:
        return status, status

    token = raw.replace(" ", "")

    m = re.match(r"^(\d+)'(\d+)''(\d+)$", token)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    m = re.match(r"^(\d+)''(\d+)$", token)
    if m:
        return f"{int(m.group(1))}.{m.group(2)}", "OK"

    m = re.match(r"^(\d+),(\d+)$", token)
    if m:
        return f"{m.group(1)}.{m.group(2)}", "OK"

    return raw, "OK"


def normalize_noc_2005(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2005.get(token) or COUNTRY_TOKEN_TO_NOC_2005.get(accentless) or token


def split_name_tokens(tokens):
    last_parts, first_parts = [], []
    in_last = True
    for token in tokens:
        cleaned = re.sub(r"[-.'`\"]", "", _strip_accents(token))
        if in_last and cleaned and cleaned.isupper():
            last_parts.append(token)
        else:
            in_last = False
            first_parts.append(token)
    return " ".join(last_parts).strip(), " ".join(first_parts).strip()


def parse_field_header_2005(line):
    return FIELD_HEADERS_2005.get(line.strip())


def parse_track_header_2005(line):
    text = re.sub(r"\s+", " ", line.strip())
    m = TRACK_HEADER_2005_RE.match(text)
    if not m:
        return None

    discipline = normalize_disc_2005(m.group("disc"))
    gender = normalize_gender(m.group("gender"))
    label = (m.group("label") or "").strip()
    group = (m.group("group") or "").strip().upper()

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""
    preserve_separate_ranking = False

    if label:
        label_lower = _strip_accents(label).lower()
        if "serie" in label_lower:
            round_value = "Heat"
            heat_match = re.search(r"(\d+)", label_lower)
            heat = heat_match.group(1) if heat_match else ""
            linked_round = "Final"
        elif "finale" in label_lower:
            round_value = "Final"
        else:
            return None
    elif group:
        round_value = "Final"
        final_group = group
        heat = group
        if discipline == "1500m":
            preserve_separate_ranking = True

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "preserveSeparateRanking": preserve_separate_ranking,
        "rawHeader": text,
    }


def parse_field_result_line_2005(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]
    raw_result = tokens[-1]
    noc_token = tokens[-2]
    name_tokens = tokens[start_index + 1:-2]
    if not name_tokens:
        return None

    last_name, first_name = split_name_tokens(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2005(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2005(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
    }


def parse_track_result_line_2005(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    qualification = ""
    if tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]
    raw_result = tokens[-1]
    noc_token = tokens[-2]
    name_tokens = tokens[start_index + 1:-2]
    if not name_tokens:
        return None

    last_name, first_name = split_name_tokens(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2005(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2005(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
    }


def build_year_results_2005(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        if page_no == 1:
            for raw_line in page_text.splitlines():
                line = re.sub(r"\s+", " ", raw_line).strip()
                if not line:
                    continue
                if line.startswith("www.fla.lu") or line.startswith("3. FLA INDOOR MEETING") or line.startswith("29.01.2005") or line.startswith("Place "):
                    continue

                field_header = parse_field_header_2005(line)
                if field_header:
                    discipline, gender = field_header
                    current = {
                        "discipline": discipline,
                        "gender": gender,
                        "round": "Final",
                        "heat": "",
                        "finalGroup": "",
                        "linkedRound": "",
                        "preserveSeparateRanking": False,
                        "rows": [],
                    }
                    sections.append(current)
                    continue

                parsed = parse_field_result_line_2005(line)
                if not parsed or not current:
                    continue
                if parsed["sectionRank"] is None:
                    parsed["sectionRank"] = len(current["rows"]) + 1
                current["rows"].append(parsed)
            continue

        if page_no < 11:
            continue

        for raw_line in page_text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if line.startswith("www.fla.lu") or line.startswith("3. FLA INDOOR MEETING") or line.startswith("29.01.2005") or line.startswith("Place "):
                continue

            header = parse_track_header_2005(line)
            if header:
                current = {**header, "rows": []}
                sections.append(current)
                continue

            parsed = parse_track_result_line_2005(line)
            if not parsed or not current:
                continue
            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2005-01-29"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] == "Final" and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in section["rows"]:
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": "",
            })

    ab_groups = {}
    for entry in results:
        if entry["round"] == "Final" and entry["finalGroup"] in {"A", "B"}:
            if entry["discipline"] == "1500m":
                continue
            ab_groups.setdefault((entry["discipline"], entry["gender"]), []).append(entry)

    for grouped_entries in ab_groups.values():
        ordered = sorted(grouped_entries, key=section_sort_key)
        for index, entry in enumerate(ordered, start=1):
            entry["rank"] = index

    return results


# ─── 2006-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2006 = {
    "Long Jump Men": ("Long Jump", "M"),
    "Pole Vault Men": ("Pole Vault", "M"),
    "Long Jump Women": ("Long Jump", "W"),
    "High Jump Women": ("High Jump", "W"),
    "Shot Put Women": ("Shot Put", "W"),
}

TRACK_HEADER_2006_RE = re.compile(
    r"^(?P<disc>60\s*m(?:\s+Hurdles)?|200\s*m|400\s*m|800\s*m|3000\s*m)\s+"
    r"(?P<gender>Men|Women)\s+[–-]\s+(?P<label>.+?)\s*$",
    re.IGNORECASE,
)

STATUS_2006_MAP = {
    "DNS": "DNS",
    "DNF": "DNF",
    "DQ": "DSQ",
    "DSQ": "DSQ",
    "DISQ": "DSQ",
    "NM": "NM",
}

COUNTRY_TOKEN_TO_NOC_2006 = {
    **COUNTRY_TOKEN_TO_NOC_2005,
    "CAD": "CAN",
    "CAN": "CAN",
    "CYP": "CYP",
    "DEN": "DEN",
    "ITA": "ITA",
    "NIG": "NGR",
    "NGR": "NGR",
    "POR": "POR",
    "SLV": "SLO",
    "SVK": "SVK",
    "TOG": "TOG",
    "ZYP": "CYP",
}

TRACK_QUALIFIERS_2006 = {"Q", "q"}
TRACK_NOTES_2006 = {"man.": "manual timing"}


def normalize_disc_2006(raw):
    return normalize_disc(re.sub(r"\s+", " ", str(raw or "").strip()))


def normalize_status_2006(raw):
    key = _strip_accents(str(raw or "").strip().upper()).replace(" ", "")
    return STATUS_2006_MAP.get(key)


def normalize_perf_2006(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if field_event and raw in {"0", "0,00", "0.00"}:
        return "NM", "NM"

    status = normalize_status_2006(raw)
    if status:
        return status, status

    token = raw.replace(" ", "")
    token = token.replace("''", '"').replace("’", "'").replace("`", "'")

    m = re.match(r"^(\d+)'(\d+)\"(\d+)$", token)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    m = re.match(r'^(\d+)\"(\d+)$', token)
    if m:
        return f"{int(m.group(1))}.{m.group(2)}", "OK"

    m = re.match(r"^(\d+),(\d+)\s*m?$", raw, re.IGNORECASE)
    if m:
        return f"{m.group(1)}.{m.group(2)}", "OK"

    return raw, "OK"


def normalize_noc_2006(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2006.get(token) or COUNTRY_TOKEN_TO_NOC_2006.get(accentless) or token


def parse_field_header_2006(line):
    return FIELD_HEADERS_2006.get(line.strip())


def parse_track_header_2006(line):
    text = re.sub(r"\s+", " ", line.strip())
    m = TRACK_HEADER_2006_RE.match(text)
    if not m:
        return None

    discipline = normalize_disc_2006(m.group("disc"))
    gender = normalize_gender(m.group("gender"))
    label = m.group("label").strip()
    label_lower = _strip_accents(label).lower()

    if discipline == "3000m" and "champion" in label_lower:
        return "skip"

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("heat"):
        round_value = "Heat"
        heat_match = re.search(r"(\d+)", label)
        heat = heat_match.group(1) if heat_match else ""
        linked_round = "Final"
    elif label_lower == "final":
        round_value = "Final"
    elif label_lower in {"final a", "a"}:
        round_value = "Final"
        final_group = "A"
        heat = "A"
    elif label_lower in {"final b", "b"}:
        round_value = "Final"
        final_group = "B"
        heat = "B"
    else:
        return None

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
    }


def parse_field_result_line_2006(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    noc_idx = None
    for i in range(start_index + 1, len(tokens)):
        token = tokens[i]
        next_token = tokens[i + 1] if i + 1 < len(tokens) else ""
        next_next_token = tokens[i + 2] if i + 2 < len(tokens) else ""
        looks_like_result = bool(
            normalize_status_2006(next_token)
            or re.match(r"^\d+,\d+$", next_token)
            or re.match(r'^\d+"?\d*$', next_token)
            or next_next_token.lower() == "m"
        )
        if re.match(r"^[A-Z]{3}$", token) and looks_like_result:
            noc_idx = i
            break

    if noc_idx is None or noc_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:noc_idx]
    if not name_tokens:
        return None

    noc_token = tokens[noc_idx]
    raw_result = tokens[noc_idx + 1]
    if noc_idx + 2 < len(tokens) and tokens[noc_idx + 2].lower() == "m":
        raw_result = f"{raw_result} m"

    last_name, first_name = split_name_tokens(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2006(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2006(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
    }


def parse_track_result_line_2006(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    trailing = []
    while tokens and (tokens[-1] in TRACK_QUALIFIERS_2006 or tokens[-1] in TRACK_NOTES_2006):
        trailing.append(tokens.pop())

    qualification = ""
    notes = []
    for token in reversed(trailing):
        if token in TRACK_QUALIFIERS_2006:
            qualification = token
        elif token in TRACK_NOTES_2006:
            notes.append(TRACK_NOTES_2006[token])

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]
    raw_result = tokens[-1]
    noc_token = tokens[-2]
    name_tokens = tokens[start_index + 1:-2]
    if not name_tokens:
        return None

    last_name, first_name = split_name_tokens(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2006(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2006(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": "; ".join(notes),
    }


def build_year_results_2006(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        for raw_line in page_text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if line.startswith("www.fla.lu") or line.startswith("PEDUS indoor meeting") or line.startswith("Friday, January 27, 2006") or line.startswith("CNSC ''Coque''") or line.startswith("Rank Bib Name Forename Club / Country Result"):
                continue
            if line.startswith("Page ") or re.match(r"^\d,\d{2}(?: \d,\d{2})+$", line):
                continue

            if page_no <= 10:
                header = parse_track_header_2006(line)
                if header == "skip":
                    current = None
                    continue
                if header:
                    current = {**header, "rows": []}
                    sections.append(current)
                    continue

                parsed = parse_track_result_line_2006(line)
                if not parsed or not current:
                    continue
                if parsed["sectionRank"] is None:
                    parsed["sectionRank"] = len(current["rows"]) + 1
                current["rows"].append(parsed)
                continue

            field_header = parse_field_header_2006(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                }
                sections.append(current)
                continue

            parsed = parse_field_result_line_2006(line)
            if not parsed or not current:
                continue
            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2006-01-27"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] == "Final" and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in section["rows"]:
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2007-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2007 = {
    "Longueur Hommes": ("Long Jump", "M"),
    "Hauteur Dames": ("High Jump", "W"),
    "Perche Hommes": ("Pole Vault", "M"),
}

TRACK_HEADER_2007_RE = re.compile(
    r"^(?P<disc>60\s*m(?:\s+Haies)?|200\s*m|800\s*m|1500\s*m)\s+"
    r"(?P<gender>Hommes(?:\s*&\s*militaire)?|Dames)\s*-\s*(?P<label>.+?)\s*$",
    re.IGNORECASE,
)

STATUS_2007_MAP = {
    "DNS": "DNS",
    "DNF": "DNF",
    "DQ": "DSQ",
    "DSQ": "DSQ",
    "DISQ": "DSQ",
    "NM": "NM",
}

COUNTRY_TOKEN_TO_NOC_2007 = {
    **COUNTRY_TOKEN_TO_NOC_2006,
    "CONGO": "CGO",
    "CSR": "CZE",
    "FRA/TOG": "FRA",
    "GRE": "GRE",
    "LU": "LUX",
    "NIG": "NGR",
    "SEN": "SEN",
    "SUE": "SWE",
    "UKR": "UKR",
}

TRACK_QUALIFIERS_2007 = {"Q", "q"}


def normalize_gender_2007(raw):
    text = _strip_accents(str(raw or "").strip()).lower()
    if "dames" in text:
        return "W"
    if "hommes" in text:
        return "M"
    return normalize_gender(raw)


def normalize_disc_2007(raw):
    return normalize_disc(re.sub(r"\s+", " ", str(raw or "").strip()))


def normalize_status_2007(raw):
    key = _strip_accents(str(raw or "").strip().upper()).replace(" ", "")
    return STATUS_2007_MAP.get(key)


def normalize_perf_2007(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if field_event and raw in {"0", "0,00", "0.00"}:
        return "NM", "NM"

    status = normalize_status_2007(raw)
    if status:
        return status, status

    token = raw.replace(" ", "")
    token = token.replace("''", '"').replace("’’", '"').replace("’", "'").replace("`", "'")

    m = re.match(r"^(\d+)'(\d+)\"(\d+)$", token)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    m = re.match(r'^(\d+)\"(\d+)$', token)
    if m:
        return f"{int(m.group(1))}.{m.group(2)}", "OK"

    m = re.match(r"^(\d+),(\d+)\s*m?$", raw, re.IGNORECASE)
    if m:
        return f"{m.group(1)}.{m.group(2)}", "OK"

    return raw, "OK"


def normalize_noc_2007(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2007.get(token) or COUNTRY_TOKEN_TO_NOC_2007.get(accentless) or token


def parse_field_header_2007(line):
    return FIELD_HEADERS_2007.get(line.strip())


def parse_track_header_2007(line):
    text = re.sub(r"\s+", " ", line.strip())
    m = TRACK_HEADER_2007_RE.match(text)
    if not m:
        return None

    discipline = normalize_disc_2007(m.group("disc"))
    gender = normalize_gender_2007(m.group("gender"))
    label = m.group("label").strip()
    label_lower = _strip_accents(label).lower()

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("serie"):
        round_value = "Heat"
        heat_match = re.search(r"(\d+)", label)
        heat = heat_match.group(1) if heat_match else ""
        linked_round = "Final"
    elif label_lower == "finale":
        round_value = "Final"
    elif label_lower == "finale a":
        round_value = "Final"
        final_group = "A"
        heat = "A"
    elif label_lower == "finale b":
        round_value = "Final"
        final_group = "B"
        heat = "B"
    else:
        return None

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
    }


def parse_field_result_line_2007(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    noc_idx = None
    for i in range(start_index + 1, len(tokens)):
        token = tokens[i]
        next_token = tokens[i + 1] if i + 1 < len(tokens) else ""
        next_next_token = tokens[i + 2] if i + 2 < len(tokens) else ""
        looks_like_result = bool(
            normalize_status_2007(next_token)
            or re.match(r"^\d+,\d+$", next_token)
            or re.match(r'^\d+"?\d*$', next_token)
            or next_next_token.lower() == "m"
        )
        normalized = normalize_noc_2007(token)
        if looks_like_result and normalized and (
            re.match(r"^[A-Z]{3}$", token) or token in COUNTRY_TOKEN_TO_NOC_2007
        ):
            noc_idx = i
            break

    if noc_idx is None or noc_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:noc_idx]
    if not name_tokens:
        return None

    noc_token = tokens[noc_idx]
    raw_result = tokens[noc_idx + 1]
    if noc_idx + 2 < len(tokens) and tokens[noc_idx + 2].lower() == "m":
        raw_result = f"{raw_result} m"

    last_name, first_name = split_name_tokens(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2007(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2007(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
    }


def parse_track_result_line_2007(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    trailing = []
    while tokens and tokens[-1] in TRACK_QUALIFIERS_2007:
        trailing.append(tokens.pop())

    qualification = ""
    for token in reversed(trailing):
        if token in TRACK_QUALIFIERS_2007:
            qualification = token

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]
    raw_result = tokens[-1]
    noc_token = tokens[-2]
    name_tokens = tokens[start_index + 1:-2]
    if not name_tokens:
        return None

    last_name, first_name = split_name_tokens(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2007(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2007(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": "",
    }


def build_year_results_2007(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        if page_no == 11:
            continue

        for raw_line in page_text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if line.startswith("www.fla.lu") or line.startswith("PEDUS indoor meeting") or line.startswith("Saturday, January 27, 2007") or line.startswith("Place Doss. Nom Prénom Club / Pays Performance"):
                continue
            if re.match(r"^\d+(?:,\d{2}\s*m?)(?:\s+\d+(?:,\d{2}\s*m?))*$", line):
                continue
            if re.match(r"^(?:\d+\s+){3,}\d+$", line):
                continue

            if page_no <= 8:
                header = parse_track_header_2007(line)
                if header:
                    current = {**header, "rows": []}
                    sections.append(current)
                    continue

                parsed = parse_track_result_line_2007(line)
                if not parsed or not current:
                    continue
                if parsed["sectionRank"] is None:
                    parsed["sectionRank"] = len(current["rows"]) + 1
                current["rows"].append(parsed)
                continue

            field_header = parse_field_header_2007(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                }
                sections.append(current)
                continue

            parsed = parse_field_result_line_2007(line)
            if not parsed or not current:
                continue
            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2007-01-27"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] == "Final" and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in section["rows"]:
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2008-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2008 = {
    "Longueur Hommes": ("Long Jump", "M"),
    "High Jump Women": ("High Jump", "W"),
    "Pole Vault Women": ("Pole Vault", "W"),
}

TRACK_HEADER_2008_RE = re.compile(
    r"^(?P<disc>60\s*m(?:\s+Haies)?|200\s*m|400\s*m|800\s*m|1500\s*m)\s+"
    r"(?P<gender>Hommes|Dames)\s*-\s*(?P<label>.+?)\s*$",
    re.IGNORECASE,
)

STATUS_2008_MAP = {
    "DNS": "DNS",
    "DNF": "DNF",
    "DQ": "DSQ",
    "DSQ": "DSQ",
    "DISQ": "DSQ",
    "NM": "NM",
}

COUNTRY_TOKEN_TO_NOC_2008 = {
    **COUNTRY_TOKEN_TO_NOC_2007,
    "BEL": "BEL",
    "CAM": "CMR",
    "CMR": "CMR",
    "ESP": "ESP",
    "FIN": "FIN",
    "IRL": "IRL",
    "NDE": "NED",
    "NDED": "NED",
    "PO": "POL",
    "POL": "POL",
    "POR": "POR",
    "RUS": "RUS",
    "SWE": "SWE",
    "UKR": "UKR",
}


def normalize_gender_2008(raw):
    return normalize_gender(raw)


def normalize_disc_2008(raw):
    return normalize_disc(re.sub(r"\s+", " ", str(raw or "").strip()))


def normalize_status_2008(raw):
    key = _strip_accents(str(raw or "").strip().upper()).replace(" ", "")
    return STATUS_2008_MAP.get(key)


def normalize_perf_2008(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if field_event and raw in {"0", "0,00", "0.00"}:
        return "NM", "NM"

    status = normalize_status_2008(raw)
    if status:
        return status, status

    token = raw.replace(" ", "")
    token = token.replace("''", '"').replace("’’", '"').replace("’", "'").replace("`", "'")

    m = re.match(r"^(\d+)'(\d+)\"(\d+)$", token)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    m = re.match(r'^(\d+)\"(\d+)$', token)
    if m:
        return f"{int(m.group(1))}.{m.group(2)}", "OK"

    m = re.match(r"^(\d+),(\d+)\s*m?$", raw, re.IGNORECASE)
    if m:
        return f"{m.group(1)}.{m.group(2)}", "OK"

    return raw, "OK"


def normalize_noc_2008(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2008.get(token) or COUNTRY_TOKEN_TO_NOC_2008.get(accentless) or token


def split_name_tokens_2008(tokens):
    last_name, first_name = split_name_tokens(tokens)
    if first_name:
        return last_name, first_name
    if len(tokens) >= 2:
        return " ".join(tokens[:-1]).strip(), tokens[-1].strip()
    return last_name, first_name


def parse_field_header_2008(line):
    return FIELD_HEADERS_2008.get(line.strip())


def parse_track_header_2008(line):
    text = re.sub(r"\s+", " ", line.strip())
    m = TRACK_HEADER_2008_RE.match(text)
    if not m:
        return None

    discipline = normalize_disc_2008(m.group("disc"))
    gender = normalize_gender_2008(m.group("gender"))
    label = m.group("label").strip()
    label_lower = _strip_accents(label).lower()

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("serie"):
        round_value = "Heat"
        heat_match = re.search(r"(\d+)", label)
        heat = heat_match.group(1) if heat_match else ""
        linked_round = "Final"
    elif label_lower == "finale":
        round_value = "Final"
    elif label_lower == "finale a":
        round_value = "Final"
        final_group = "A"
        heat = "A"
    elif label_lower == "finale b":
        round_value = "Final"
        final_group = "B"
        heat = "B"
    elif label_lower == "finale c":
        round_value = "Final"
        final_group = "C"
        heat = "C"
    else:
        return None

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
    }


def parse_field_result_line_2008(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    noc_idx = None
    for i in range(start_index + 1, len(tokens)):
        token = tokens[i]
        next_token = tokens[i + 1] if i + 1 < len(tokens) else ""
        next_next_token = tokens[i + 2] if i + 2 < len(tokens) else ""
        looks_like_result = bool(
            normalize_status_2008(next_token)
            or re.match(r"^\d+,\d+$", next_token)
            or re.match(r'^\d+"?\d*$', next_token)
            or next_next_token.lower() == "m"
        )
        normalized = normalize_noc_2008(token)
        if looks_like_result and normalized and (
            re.match(r"^[A-Z]{3,4}$", token) or token in COUNTRY_TOKEN_TO_NOC_2008
        ):
            noc_idx = i
            break

    if noc_idx is None or noc_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:noc_idx]
    if not name_tokens:
        return None

    noc_token = tokens[noc_idx]
    raw_result = tokens[noc_idx + 1]
    if noc_idx + 2 < len(tokens) and tokens[noc_idx + 2].lower() == "m":
        raw_result = f"{raw_result} m"

    last_name, first_name = split_name_tokens_2008(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2008(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2008(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
    }


def parse_track_result_line_2008(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    qualification = ""
    if len(tokens) >= 2 and tokens[-2] in {"Q", "q"} and tokens[-1] in {"A", "B", "C"}:
        qualification = f"{tokens[-2]} {tokens[-1]}"
        tokens = tokens[:-2]
    elif tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]
    raw_result = tokens[-1]
    noc_token = tokens[-2]
    name_tokens = tokens[start_index + 1:-2]
    if not name_tokens:
        return None

    last_name, first_name = split_name_tokens_2008(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2008(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2008(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": "",
    }


def dedupe_rows_2008(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row["rawResult"],
            row["status"],
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2008(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        if page_no < 3:
            continue

        for raw_line in page_text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if line.startswith("www.fla.lu") or line.startswith("6. PEDUS indoor meeting") or line.startswith("Saturday, January 19, 2008") or line.startswith("Place Doss. Nom Prénom Club / Pays Performance"):
                continue
            if re.match(r"^\d+(?:,\d{2}\s*m?)(?:\s+\d+(?:,\d{2}\s*m?))*$", line):
                continue
            if re.match(r"^(?:\d+\s+){3,}\d+$", line):
                continue

            if page_no <= 9:
                header = parse_track_header_2008(line)
                if header:
                    current = {**header, "rows": []}
                    sections.append(current)
                    continue

                parsed = parse_track_result_line_2008(line)
                if not parsed or not current:
                    continue
                if parsed["sectionRank"] is None:
                    parsed["sectionRank"] = len(current["rows"]) + 1
                current["rows"].append(parsed)
                continue

            field_header = parse_field_header_2008(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                }
                sections.append(current)
                continue

            parsed = parse_field_result_line_2008(line)
            if not parsed or not current:
                continue
            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2008-01-19"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] == "Final" and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2008(section["rows"]):
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2009-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2009 = {
    "High Jump Women": ("High Jump", "W"),
    "Pole Vault Women": ("Pole Vault", "W"),
    "Pole Vault Men": ("Pole Vault", "M"),
}

TRACK_HEADER_2009_RE = re.compile(
    r"^(?P<disc>60\s*m(?:\s+Haies)?|200\s*m|400\s*m|800\s*m|1500\s*m)\s+"
    r"(?P<gender>Hommes|Dames)(?:\s*(?:-\s*|\s+)(?P<label>S[ée]rie\s+\d+|Finale(?:\s+[AB])?))?\s*$",
    re.IGNORECASE,
)

STATUS_2009_MAP = {
    "DNS": "DNS",
    "DNF": "DNF",
    "NM": "NM",
    "DQ": "DSQ",
    "DSQ": "DSQ",
    "DISQ": "DSQ",
    "DISQ.": "DSQ",
}

COUNTRY_TOKEN_TO_NOC_2009 = {
    **COUNTRY_TOKEN_TO_NOC_2008,
    "ANG": "ANG",
    "CZR": "CZE",
    "ITA": "ITA",
    "NIG": "NGA",
    "SUI": "SUI",
    "USA": "USA",
}

NAME_FIXES_2009 = {
    ("CLAUDE-BOX.", "Ophélie"): ("CLAUDE-BOXBERGER", "Ophélie"),
}


def normalize_gender_2009(raw):
    return normalize_gender(raw)


def normalize_disc_2009(raw):
    return normalize_disc(re.sub(r"\s+", " ", str(raw or "").strip()))


def normalize_status_2009(raw):
    key = _strip_accents(str(raw or "").strip().upper()).replace(" ", "")
    return STATUS_2009_MAP.get(key)


def normalize_perf_2009(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if field_event and raw in {"0", "0,00", "0.00"}:
        return "NM", "NM"

    status = normalize_status_2009(raw)
    if status:
        return status, status

    token = raw.replace(" ", "")
    token = token.replace("''", '"').replace("’’", '"').replace("’", "'").replace("`", "'")

    m = re.match(r"^(\d+)'(\d+)\"(\d+)$", token)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    m = re.match(r'^(\d+)\"(\d+)$', token)
    if m:
        return f"{int(m.group(1))}.{m.group(2)}", "OK"

    m = re.match(r"^(\d+),(\d+)\s*m?$", raw, re.IGNORECASE)
    if m:
        return f"{m.group(1)}.{m.group(2)}", "OK"

    return raw, "OK"


def normalize_noc_2009(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2009.get(token) or COUNTRY_TOKEN_TO_NOC_2009.get(accentless) or token


def normalize_name_2009(last_name, first_name):
    return NAME_FIXES_2009.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2009(tokens):
    last_name, first_name = split_name_tokens(tokens)
    if first_name:
        return normalize_name_2009(last_name, first_name)
    if len(tokens) >= 2:
        return normalize_name_2009(" ".join(tokens[:-1]).strip(), tokens[-1].strip())
    return normalize_name_2009(last_name, first_name)


def parse_field_header_2009(line):
    return FIELD_HEADERS_2009.get(line.strip())


def parse_track_header_2009(line):
    text = re.sub(r"\s+", " ", line.strip())
    m = TRACK_HEADER_2009_RE.match(text)
    if not m:
        return None

    discipline = normalize_disc_2009(m.group("disc"))
    gender = normalize_gender_2009(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("serie"):
        round_value = "Heat"
        heat_match = re.search(r"(\d+)", label)
        heat = heat_match.group(1) if heat_match else ""
        linked_round = "Final"
    elif label_lower == "finale":
        round_value = "Final"
    elif label_lower == "finale a":
        round_value = "Final"
        final_group = "A"
        heat = "A"
    elif label_lower == "finale b":
        round_value = "Final"
        final_group = "B"
        heat = "B"
    elif not label:
        round_value = "Final"
    else:
        return None

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
    }


def parse_field_result_line_2009(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    noc_idx = None
    for i in range(start_index + 1, len(tokens)):
        token = tokens[i]
        next_token = tokens[i + 1] if i + 1 < len(tokens) else ""
        next_next_token = tokens[i + 2] if i + 2 < len(tokens) else ""
        looks_like_result = bool(
            normalize_status_2009(next_token)
            or re.match(r"^\d+,\d+$", next_token)
            or re.match(r'^\d+"?\d*$', next_token)
            or next_next_token.lower() == "m"
        )
        normalized = normalize_noc_2009(token)
        if looks_like_result and normalized and (
            re.match(r"^[A-Z]{3,4}$", token) or token in COUNTRY_TOKEN_TO_NOC_2009
        ):
            noc_idx = i
            break

    if noc_idx is None or noc_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:noc_idx]
    if not name_tokens:
        return None

    noc_token = tokens[noc_idx]
    raw_result = tokens[noc_idx + 1]
    if noc_idx + 2 < len(tokens) and tokens[noc_idx + 2].lower() == "m":
        raw_result = f"{raw_result} m"

    last_name, first_name = split_name_tokens_2009(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2009(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2009(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
    }


def parse_track_result_line_2009(line):
    tokens = line.split()
    if len(tokens) < 4:
        return None

    qualification = ""
    if len(tokens) >= 2 and tokens[-2] in {"Q", "q"} and tokens[-1] in {"A", "B", "C"}:
        qualification = f"{tokens[-2]} {tokens[-1]}"
        tokens = tokens[:-2]
    elif tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]
    raw_result = tokens[-1]
    noc_token = tokens[-2]
    name_tokens = tokens[start_index + 1:-2]
    if not name_tokens:
        return None

    last_name, first_name = split_name_tokens_2009(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2009(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2009(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": "",
    }


def dedupe_rows_2009(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row["rawResult"],
            row["status"],
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2009(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        if page_no <= 3:
            continue

        for raw_line in page_text.splitlines():
            line = re.sub(r"\s+", " ", raw_line).strip()
            if not line:
                continue
            if line.startswith("www.fla.lu") or line.startswith("7. DUSSMANN indoor meeting") or line.startswith("Saturday, January 17, 2009") or line.startswith("Place Doss. Nom Prénom Club / Pays Performance"):
                continue

            if page_no <= 11:
                header = parse_track_header_2009(line)
                if header:
                    current = {**header, "rows": []}
                    sections.append(current)
                    continue

                parsed = parse_track_result_line_2009(line)
                if not parsed or not current:
                    continue
                if parsed["sectionRank"] is None:
                    parsed["sectionRank"] = len(current["rows"]) + 1
                current["rows"].append(parsed)
                continue

            if page_no >= 13:
                continue

            field_header = parse_field_header_2009(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                }
                sections.append(current)
                continue

            parsed = parse_field_result_line_2009(line)
            if not parsed or not current:
                continue
            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    grouped_sections = {}
    for section in sections:
        key = (section["discipline"], section["gender"])
        grouped_sections.setdefault(key, []).append(section)

    filtered_sections = []
    for key, group in grouped_sections.items():
        has_named_finals = any(s["round"] == "Final" and s["finalGroup"] in {"A", "B", "C"} for s in group)
        for section in group:
            if has_named_finals and section["round"] == "Final" and not section["finalGroup"]:
                continue
            filtered_sections.append(section)

    edition_date = "2009-01-17"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in filtered_sections
        if section["round"] == "Heat"
    }

    for section in filtered_sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] == "Final" and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2009(section["rows"]):
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2010-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2010 = {
    "Hauteur dames, Dames - Finale": ("High Jump", "W"),
    "Perche Dames, Dames - Finale": ("Pole Vault", "W"),
    "Perche Hommes, Hommes - Finale": ("Pole Vault", "M"),
}

TRACK_HEADER_2010_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Dames|Hommes)\s*-\s*"
    r"(?P<label>Finale(?:\s+[ABC])?|S[ée]rie|Zeitl[aä]ufe)\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2010_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+haies)?|60m\s+haies|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2010 = {
    **COUNTRY_TOKEN_TO_NOC_2009,
    "ERT": "ERI",
    "LLUX": "LUX",
    "OHA": "NED",
    "RA": "FRA",
    "SLOV": "SLO",
}

NAME_FIXES_2010 = {
    ("CLAUDE-BOXBERGER", "Ophélie"): ("CLAUDE-BOXBERGER", "Ophélie"),
    ("KOWALINSKI", "MARC"): ("KOWALINSKI", "Marc"),
    ("MOH", "CLARISSE"): ("MOH", "Clarisse"),
}

ROMAN_HEAT_TO_NUMBER_2010 = {
    "I": "1",
    "II": "2",
    "III": "3",
    "IV": "4",
    "V": "5",
}

PLACEMENT_TOKEN_2010_RE = re.compile(r"^(?P<place>\d+)\./(?P<heat>[IVX]+)$", re.IGNORECASE)


def preprocess_line_2010(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    text = text.replace("CLAUDE-BOXBERGER Ophél1ie988", "CLAUDE-BOXBERGER Ophélie 1988")
    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_noc_2010(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2010.get(token) or COUNTRY_TOKEN_TO_NOC_2010.get(accentless) or token


def normalize_name_2010(last_name, first_name):
    return NAME_FIXES_2010.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2010(tokens):
    last_name, first_name = split_name_tokens_2009(tokens)
    return normalize_name_2010(last_name, first_name)


def normalize_perf_2010(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    m = re.match(r"^(\d+):(\d+),(\d+)$", raw)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    return normalize_perf_2009(raw, field_event=field_event)


def parse_field_header_2010(line):
    return FIELD_HEADERS_2010.get(preprocess_line_2010(line))


def parse_track_header_2010(line):
    text = preprocess_line_2010(line)
    m = TRACK_HEADER_2010_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender_2009(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    disc_match = TRACK_DISC_2010_RE.search(disc_raw)
    if not disc_match:
        return None

    discipline = normalize_disc_2009(disc_match.group("disc"))
    suffix_match = re.search(r"\b([ABC])$", disc_raw)
    suffix_group = suffix_match.group(1) if suffix_match else ""

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("serie"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower == "zeitlaufe":
        round_value = "Timed Final"
    elif label_lower.startswith("finale"):
        round_value = "Final"
    else:
        return None

    if round_value != "Heat":
        label_group_match = re.search(r"\b([ABC])$", label)
        final_group = label_group_match.group(1) if label_group_match else suffix_group
        if final_group:
            heat = final_group

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
    }


def parse_track_result_line_2010(line):
    text = preprocess_line_2010(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    source_heat = ""
    placement_match = PLACEMENT_TOKEN_2010_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_HEAT_TO_NUMBER_2010.get(placement_match.group("heat").upper(), "")
        tokens = tokens[:-1]

    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q", "v"}:
        marker = tokens[-1]
        tokens = tokens[:-1]
        if marker in {"Q", "q"}:
            qualification = marker
        else:
            notes = marker

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 2 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    noc_token = tokens[yob_idx + 1]
    raw_result = tokens[yob_idx + 2]
    last_name, first_name = split_name_tokens_2010(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2010(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2010(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2010(line):
    text = preprocess_line_2010(line)
    tokens = text.split()
    if len(tokens) < 5:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 5:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 2 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    noc_token = tokens[yob_idx + 1]
    raw_result = tokens[yob_idx + 2]
    if yob_idx + 3 < len(tokens) and tokens[yob_idx + 3].lower() == "m":
        raw_result = f"{raw_result} m"

    last_name, first_name = split_name_tokens_2010(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2010(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": normalize_noc_2010(noc_token),
        "club": "",
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def dedupe_rows_2010(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2010(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        if page_no == 1:
            continue

        for raw_line in page_text.splitlines():
            line = preprocess_line_2010(raw_line)
            if not line:
                continue
            if (
                line.startswith("Printed on ")
                or line.startswith("8. Dussmann indoor Meeting 2010 Results")
                or line.startswith(", at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("RgS.tartnr ")
                or line.startswith("Heat 1 of 1")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line == "Fehlstart"
            ):
                continue

            field_header = parse_field_header_2010(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2010(line)
            if track_header:
                current = {**track_header, "rows": []}
                sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault"}:
                parsed = parse_field_result_line_2010(line)
            else:
                parsed = parse_track_result_line_2010(line)

            if not parsed:
                continue

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2010-01-16"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2010(section["rows"]):
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": row.get("sourceHeat") or section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2011-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2011 = {
    "Hauteur dames, Dames - Finale": ("High Jump", "W"),
    "Perche Dames, Dames - Finale": ("Pole Vault", "W"),
    "Perche Hommes, Hommes - Finale": ("Pole Vault", "M"),
}

TRACK_HEADER_2011_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Dames|Hommes)\s*-\s*"
    r"(?P<label>Finale(?:\s+[ABC])?|S[ée]rie|Zeitl[aä]ufe)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2011_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+haies)?|60m\s+haies|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2011 = {
    **COUNTRY_TOKEN_TO_NOC_2010,
    "B": "BEL",
    "BUL": "BUL",
    "CPV": "CPV",
    "CVP": "CPV",
    "D": "DEU",
    "ETH": "ETH",
    "F": "FRA",
    "GB": "GBR",
    "GBR": "GBR",
    "L": "LUX",
    "LAT": "LAT",
    "MAR": "MAR",
    "NL": "NED",
    "SVK": "SVK",
    "USA": "USA",
    "ZIM": "ZIM",
}

NAME_FIXES_2011 = {
    ("BERTHEAU", "LOUISE"): ("BERTHEAU", "Louise"),
    ("CRUZ DANTAS VILELA", "Namuel"): ("CRUZ DANTAS VILELA", "Namuel"),
    ("GIZA", "Macjec"): ("GIZA", "Macjec"),
    ("MOH", "Clarisse"): ("MOH", "Clarisse"),
    ("SCHMOETTEN-STEFFEN", "Pascale"): ("SCHMOETTEN-STEFFEN", "Pascale"),
}

PLACEMENT_TOKEN_2011_RE = re.compile(r"^(?P<place>\d+)\./(?P<heat>[IVX]+)$", re.IGNORECASE)


def preprocess_line_2011(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "CRUZ DANTAS VILELA Namu1e9l88 CVP LUX": "CRUZ DANTAS VILELA Namuel 1988 CVP LUX",
        "SCHMOETTEN-STEFFEN Pas1c9a6l8 LUX CELTIC": "SCHMOETTEN-STEFFEN Pascale 1968 LUX CELTIC",
        "GIZA Macjec 1986 POL POL": "GIZA Macjec 1986 POL POL",
        "SAINT -MARC": "SAINT-MARC",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2011(raw):
    text = preprocess_line_2011(raw)
    if re.search(r"400m\s+H\b", text, re.IGNORECASE):
        return "400m Hurdles"

    disc_match = TRACK_DISC_2011_RE.search(text)
    if not disc_match:
        return None
    return normalize_disc_2009(disc_match.group("disc"))


def normalize_noc_2011(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2011.get(token) or COUNTRY_TOKEN_TO_NOC_2011.get(accentless) or token


def normalize_team_2011(raw_token):
    token = str(raw_token or "").strip()
    if not token:
        return ""
    return normalize_noc_2011(token)


def normalize_name_2011(last_name, first_name):
    return NAME_FIXES_2011.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2011(tokens):
    last_name, first_name = split_name_tokens_2009(tokens)
    return normalize_name_2011(last_name, first_name)


def normalize_perf_2011(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if raw.lower() == "w.v.t.":
        return "DNS", "DNS"

    m = re.match(r"^(\d+):(\d+),(\d+)$", raw)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    return normalize_perf_2009(raw, field_event=field_event)


def normalize_club_2011(team_token, noc):
    raw = str(team_token or "").strip().upper()
    if not raw:
        return ""
    normalized_team = normalize_team_2011(raw)
    if normalized_team == noc:
        return ""
    return raw


def parse_field_header_2011(line):
    text = preprocess_line_2011(line)
    if "Continuation" in text:
        return None
    return FIELD_HEADERS_2011.get(text)


def parse_track_header_2011(line):
    text = preprocess_line_2011(line)
    if "Continuation" in text:
        return None

    m = TRACK_HEADER_2011_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender_2009(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2011(disc_raw)
    if not discipline:
        return None

    suffix_match = re.search(r"\b([ABC])$", disc_raw)
    suffix_group = suffix_match.group(1) if suffix_match else ""
    is_elite = bool(re.search(r"\bElite\b", disc_raw, re.IGNORECASE))

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("serie"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower == "zeitlaufe":
        if suffix_group:
            round_value = "Final"
            final_group = suffix_group
            heat = suffix_group
        elif is_elite:
            round_value = "Timed Final"
            final_group = "Elite"
            heat = "Elite"
        else:
            round_value = "Timed Final"
    elif label_lower.startswith("finale"):
        round_value = "Final"
    else:
        return None

    if round_value != "Heat" and not final_group:
        label_group_match = re.search(r"\b([ABC])$", label)
        final_group = label_group_match.group(1) if label_group_match else suffix_group
        if final_group and not heat:
            heat = final_group

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
    }


def parse_track_result_line_2011(line):
    text = preprocess_line_2011(line)
    tokens = text.split()
    if len(tokens) < 6:
        return None

    source_heat = ""
    placement_match = PLACEMENT_TOKEN_2011_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_HEAT_TO_NUMBER_2010.get(placement_match.group("heat").upper(), "")
        tokens = tokens[:-1]

    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q", "v"}:
        marker = tokens[-1]
        tokens = tokens[:-1]
        if marker in {"Q", "q"}:
            qualification = marker
        else:
            notes = marker

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 6:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 3 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    nat_token = tokens[yob_idx + 1]
    team_token = tokens[yob_idx + 2]
    raw_result = tokens[yob_idx + 3]
    noc = normalize_noc_2011(nat_token)
    club = normalize_club_2011(team_token, noc)
    last_name, first_name = split_name_tokens_2011(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2011(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2011(line):
    text = preprocess_line_2011(line)
    tokens = text.split()
    if len(tokens) < 6:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 6:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 3 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    nat_token = tokens[yob_idx + 1]
    team_token = tokens[yob_idx + 2]
    raw_result = tokens[yob_idx + 3]
    if yob_idx + 4 < len(tokens) and tokens[yob_idx + 4].lower() == "m":
        raw_result = f"{raw_result} m"

    noc = normalize_noc_2011(nat_token)
    club = normalize_club_2011(team_token, noc)
    last_name, first_name = split_name_tokens_2011(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2011(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def dedupe_rows_2011(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2011(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        if page_no == 1:
            continue

        for raw_line in page_text.splitlines():
            line = preprocess_line_2011(raw_line)
            if not line:
                continue
            if (
                line.startswith("Printed on ")
                or line.startswith("9. Dussmann Indoor Meeting 2011 Results")
                or line.startswith("Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Heat 1 of 1")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line == "Final - Continuation"
                or line.startswith("Final Start time:")
                or line.startswith("New Meeting Record ")
            ):
                continue

            field_header = parse_field_header_2011(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2011(line)
            if track_header:
                current = {**track_header, "rows": []}
                sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault"}:
                parsed = parse_field_result_line_2011(line)
            else:
                parsed = parse_track_result_line_2011(line)

            if not parsed:
                continue

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2011-01-29"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2011(section["rows"]):
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": row.get("sourceHeat") or section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2011-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2011 = {
    "Hauteur dames, Dames - Finale": ("High Jump", "W"),
    "Perche Dames, Dames - Finale": ("Pole Vault", "W"),
    "Perche Hommes, Hommes - Finale": ("Pole Vault", "M"),
}

TRACK_HEADER_2011_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Dames|Hommes)\s*-\s*"
    r"(?P<label>Finale(?:\s+[ABC])?|S[ée]rie|Zeitl[aä]ufe)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2011_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+haies)?|60m\s+haies|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2011 = {
    **COUNTRY_TOKEN_TO_NOC_2010,
    "B": "BEL",
    "BUL": "BUL",
    "CPV": "CPV",
    "CVP": "CPV",
    "D": "DEU",
    "ETH": "ETH",
    "F": "FRA",
    "GB": "GBR",
    "GBR": "GBR",
    "L": "LUX",
    "LAT": "LAT",
    "MAR": "MAR",
    "NL": "NED",
    "SVK": "SVK",
    "USA": "USA",
    "ZIM": "ZIM",
}

NAME_FIXES_2011 = {
    ("BERTHEAU", "LOUISE"): ("BERTHEAU", "Louise"),
    ("CRUZ DANTAS VILELA", "Namuel"): ("CRUZ DANTAS VILELA", "Namuel"),
    ("GIZA", "Macjec"): ("GIZA", "Macjec"),
    ("MOH", "Clarisse"): ("MOH", "Clarisse"),
    ("SCHMOETTEN-STEFFEN", "Pascale"): ("SCHMOETTEN-STEFFEN", "Pascale"),
}

PLACEMENT_TOKEN_2011_RE = re.compile(r"^(?P<place>\d+)\./(?P<heat>[IVX]+)$", re.IGNORECASE)


def preprocess_line_2011(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "CRUZ DANTAS VILELA Namu1e9l88 CVP LUX": "CRUZ DANTAS VILELA Namuel 1988 CVP LUX",
        "SCHMOETTEN-STEFFEN Pas1c9a6l8 LUX CELTIC": "SCHMOETTEN-STEFFEN Pascale 1968 LUX CELTIC",
        "SAINT -MARC": "SAINT-MARC",
        "V ERBERNE Cyriel 1995 NL NED": "VERBERNE Cyriel 1995 NL NED",
        "VAN DEN Broeck Jan 1989 B BEL": "VAN DEN BROECK Jan 1989 B BEL",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2011(raw):
    text = preprocess_line_2011(raw)
    if re.search(r"400m\s+H\b", text, re.IGNORECASE):
        return "400m Hurdles"

    disc_match = TRACK_DISC_2011_RE.search(text)
    if not disc_match:
        return None
    return normalize_disc_2009(disc_match.group("disc"))


def normalize_noc_2011(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2011.get(token) or COUNTRY_TOKEN_TO_NOC_2011.get(accentless) or token


def normalize_name_2011(last_name, first_name):
    return NAME_FIXES_2011.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2011(tokens):
    last_name, first_name = split_name_tokens_2009(tokens)
    return normalize_name_2011(last_name, first_name)


def normalize_perf_2011(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if raw.lower() == "w.v.t.":
        return "DNS", "DNS"

    m = re.match(r"^(\d+):(\d+),(\d+)$", raw)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    return normalize_perf_2009(raw, field_event=field_event)


def normalize_club_2011(team_token, noc):
    raw = str(team_token or "").strip().upper()
    if not raw:
        return ""
    normalized_team = normalize_noc_2011(raw)
    if normalized_team == noc:
        return ""
    return raw


def parse_field_header_2011(line):
    text = preprocess_line_2011(line)
    if "Continuation" in text:
        return None
    return FIELD_HEADERS_2011.get(text)


def parse_track_header_2011(line):
    text = preprocess_line_2011(line)
    if "Continuation" in text:
        return None

    m = TRACK_HEADER_2011_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender_2009(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2011(disc_raw)
    if not discipline:
        return None

    suffix_match = re.search(r"\b([ABC])$", disc_raw)
    suffix_group = suffix_match.group(1) if suffix_match else ""
    is_elite = bool(re.search(r"\bElite\b", disc_raw, re.IGNORECASE))

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("serie"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower == "zeitlaufe":
        if suffix_group:
            round_value = "Final"
            final_group = suffix_group
            heat = suffix_group
        elif is_elite:
            round_value = "Timed Final"
            final_group = "Elite"
            heat = "Elite"
        else:
            round_value = "Timed Final"
    elif label_lower.startswith("finale"):
        round_value = "Final"
    else:
        return None

    if round_value != "Heat" and not final_group:
        label_group_match = re.search(r"\b([ABC])$", label)
        final_group = label_group_match.group(1) if label_group_match else suffix_group
        if final_group and not heat:
            heat = final_group

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
    }


def parse_track_result_line_2011(line):
    text = preprocess_line_2011(line)
    tokens = text.split()
    if len(tokens) < 6:
        return None

    source_heat = ""
    placement_match = PLACEMENT_TOKEN_2011_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_HEAT_TO_NUMBER_2010.get(placement_match.group("heat").upper(), "")
        tokens = tokens[:-1]

    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q", "v"}:
        marker = tokens[-1]
        tokens = tokens[:-1]
        if marker in {"Q", "q"}:
            qualification = marker
        else:
            notes = marker

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 6:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 3 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    nat_token = tokens[yob_idx + 1]
    team_token = tokens[yob_idx + 2]
    raw_result = tokens[yob_idx + 3]
    noc = normalize_noc_2011(nat_token)
    club = normalize_club_2011(team_token, noc)
    last_name, first_name = split_name_tokens_2011(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2011(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2011(line):
    text = preprocess_line_2011(line)
    tokens = text.split()
    if len(tokens) < 6:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 6:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 3 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    nat_token = tokens[yob_idx + 1]
    team_token = tokens[yob_idx + 2]
    raw_result = tokens[yob_idx + 3]
    if yob_idx + 4 < len(tokens) and tokens[yob_idx + 4].lower() == "m":
        raw_result = f"{raw_result} m"

    noc = normalize_noc_2011(nat_token)
    club = normalize_club_2011(team_token, noc)
    last_name, first_name = split_name_tokens_2011(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2011(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def dedupe_rows_2011(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2011(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        if page_no == 1:
            continue

        for raw_line in page_text.splitlines():
            line = preprocess_line_2011(raw_line)
            if not line:
                continue
            if (
                line.startswith("Printed on ")
                or line.startswith("9. Dussmann Indoor Meeting 2011 Results")
                or line.startswith("Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Heat 1 of 1")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line == "Final - Continuation"
                or line.startswith("Final Start time:")
                or line.startswith("New Meeting Record ")
            ):
                continue

            field_header = parse_field_header_2011(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2011(line)
            if track_header:
                current = {**track_header, "rows": []}
                sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault"}:
                parsed = parse_field_result_line_2011(line)
            else:
                parsed = parse_track_result_line_2011(line)

            if not parsed:
                continue

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2011-01-29"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2011(section["rows"]):
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": row.get("sourceHeat") or section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2012-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2012 = {
    "Hauteur dames, Dames - Finale": ("High Jump", "W"),
    "Perche Dames, Dames - Finale": ("Pole Vault", "W"),
    "Hochsprung, Hommes - Finale": ("High Jump", "M"),
    "Perche Hommes, Hommes - Finale": ("Pole Vault", "M"),
    "Kugelstoßen, Hommes - Finale": ("Shot Put", "M"),
}

TRACK_HEADER_2012_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Dames|Hommes)\s*-\s*"
    r"(?P<label>Finale(?:\s+[ABC])?|S[ée]rie|Zeitl[aä]ufe|Vorl[aä]ufe)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2012_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+h[üu]rden|(?:\s+haies)?)?|60m\s+h[üu]rden|60m\s+haies|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2012 = {
    **COUNTRY_TOKEN_TO_NOC_2011,
    "BEK": "BEL",
    "CAM": "CMR",
    "CMR": "CMR",
    "HUN": "HUN",
    "NIG": "NGA",
    "NGA": "NGA",
    "SLV": "SVK",
}

NAME_FIXES_2012 = {
    ("CLAUDE-BOXBERGER", "Ophélie"): ("CLAUDE-BOXBERGER", "Ophélie"),
    ("GHAFFOORT", "Madiea"): ("GHAFFOORT", "Madiea"),
    ("JACQUOT", "Emilie"): ("JACQUOT", "Emilie"),
    ("SCHIPPERS", "Dafne"): ("SCHIPPERS", "Dafne"),
    ("SCHMOETTEN", "Pascale"): ("SCHMOETTEN", "Pascale"),
    ("SCHWARZER", "Helge"): ("SCHWARZER", "Helge"),
}

PLACEMENT_TOKEN_2012_RE = re.compile(r"^(?P<place>\d+)\./(?P<heat>[IVX]+)$", re.IGNORECASE)
HEAT_LINE_2012_RE = re.compile(r"^Heat\s+(?P<heat>\d+)\s+of\s+\d+$", re.IGNORECASE)


def preprocess_line_2012(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "SCHIPPERS": "SCHIPPERS",
        "GHAFOORT": "GHAFFOORT",
        "CLAUDE-BOXBERGER Ophél1ie988": "CLAUDE-BOXBERGER Ophélie 1988",
        "JACQUOT Emelie": "JACQUOT Emilie",
        "CRUZ DANTAS VILELA Namu1e9l88 LUX FLA": "CRUZ DANTAS VILELA Namuel 1988 LUX FLA",
        "SCHWARTZER": "SCHWARZER",
        "JUNGFLEISCH Marie-Laurenc1e990": "JUNGFLEISCH Marie-Laurence 1990",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2012(raw):
    text = preprocess_line_2012(raw)
    normalized = (
        text.replace("Hürden", "Haies")
        .replace("hürden", "haies")
        .replace("Hurden", "Haies")
    )
    disc_match = TRACK_DISC_2012_RE.search(normalized)
    if not disc_match:
        return None
    return normalize_disc_2009(disc_match.group("disc").replace("Hürden", "Haies"))


def normalize_noc_2012(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2012.get(token) or COUNTRY_TOKEN_TO_NOC_2012.get(accentless) or token


def normalize_name_2012(last_name, first_name):
    return NAME_FIXES_2012.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2012(tokens):
    last_name, first_name = split_name_tokens_2009(tokens)
    return normalize_name_2012(last_name, first_name)


def normalize_perf_2012(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if raw.lower() == "w.v.t.":
        return "DNS", "DNS"

    m = re.match(r"^(\d+):(\d+),(\d+)$", raw)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    return normalize_perf_2009(raw, field_event=field_event)


def normalize_club_2012(team_token, noc):
    raw = str(team_token or "").strip().upper()
    if not raw:
        return ""
    normalized_team = normalize_noc_2012(raw)
    if normalized_team == noc:
        return ""
    return raw


def parse_field_header_2012(line):
    text = preprocess_line_2012(line)
    if "Continuation" in text:
        return None
    return FIELD_HEADERS_2012.get(text)


def parse_track_header_2012(line):
    text = preprocess_line_2012(line)
    if "Continuation" in text:
        return None

    m = TRACK_HEADER_2012_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender_2009(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2012(disc_raw)
    if not discipline:
        return None

    suffix_match = re.search(r"\b([ABC])$", disc_raw)
    suffix_group = suffix_match.group(1) if suffix_match else ""

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("serie") or label_lower.startswith("vorlaufe"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower == "zeitlaufe":
        if suffix_group:
            round_value = "Final"
            final_group = suffix_group
            heat = suffix_group
        else:
            round_value = "Timed Final"
    elif label_lower.startswith("finale"):
        round_value = "Final"
    else:
        return None

    if round_value != "Heat" and not final_group:
        label_group_match = re.search(r"\b([ABC])$", label)
        final_group = label_group_match.group(1) if label_group_match else suffix_group
        if final_group:
            heat = final_group

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
        "_active_heat": "",
    }


def parse_track_result_line_2012(line, *, active_heat=""):
    text = preprocess_line_2012(line)
    tokens = text.split()
    if len(tokens) < 6:
        return None

    source_heat = active_heat
    placement_match = PLACEMENT_TOKEN_2012_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_HEAT_TO_NUMBER_2010.get(placement_match.group("heat").upper(), "")
        tokens = tokens[:-1]

    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q", "v"}:
        marker = tokens[-1]
        tokens = tokens[:-1]
        if marker in {"Q", "q"}:
            qualification = marker
        else:
            notes = marker

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 6:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 3 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    nat_token = tokens[yob_idx + 1]
    team_token = tokens[yob_idx + 2]
    raw_result = tokens[yob_idx + 3]
    noc = normalize_noc_2012(nat_token)
    club = normalize_club_2012(team_token, noc)
    last_name, first_name = split_name_tokens_2012(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2012(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2012(line):
    text = preprocess_line_2012(line)
    tokens = text.split()
    if len(tokens) < 6:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 6:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 3 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    nat_token = tokens[yob_idx + 1]
    team_token = tokens[yob_idx + 2]
    raw_result = tokens[yob_idx + 3]
    if yob_idx + 4 < len(tokens) and tokens[yob_idx + 4].lower() == "m":
        raw_result = f"{raw_result} m"

    noc = normalize_noc_2012(nat_token)
    club = normalize_club_2012(team_token, noc)
    last_name, first_name = split_name_tokens_2012(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2012(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def dedupe_rows_2012(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2012(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        for raw_line in page_text.splitlines():
            line = preprocess_line_2012(raw_line)
            if not line:
                continue

            heat_line_match = HEAT_LINE_2012_RE.match(line)
            if heat_line_match:
                if current and current.get("round") == "Heat":
                    current["_active_heat"] = heat_line_match.group("heat")
                continue

            if (
                line.startswith("Printed on ")
                or line.startswith("10. DUSSMANN indoor meeting Results")
                or line.startswith("Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line == "Final - Continuation"
                or line == "False start"
                or line.startswith("Weight: ")
            ):
                continue

            field_header = parse_field_header_2012(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                    "_active_heat": "",
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2012(line)
            if track_header:
                current = {**track_header, "rows": []}
                sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault", "Shot Put"}:
                parsed = parse_field_result_line_2012(line)
            else:
                parsed = parse_track_result_line_2012(line, active_heat=current.get("_active_heat", ""))

            if not parsed:
                continue

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2012-02-04"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2012(section["rows"]):
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": row.get("sourceHeat") or section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2013-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2013 = {
    "Hauteur, Hommes - Finale": ("High Jump", "M"),
    "Perche, Hommes - Finale": ("Pole Vault", "M"),
    "Perche , Dames - Finale": ("Pole Vault", "W"),
}

TRACK_HEADER_2013_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Dames|Hommes)\s*-\s*"
    r"(?P<label>Finale(?:\s+[ABC])?|Zeitl[aä]ufe|Vorl[aä]ufe)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2013_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+h[üu]rden|(?:\s+haies)?)?|60m\s+h[üu]rden|60m\s+haies|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2013 = {
    **COUNTRY_TOKEN_TO_NOC_2012,
    "FR": "FRA",
    "RFA": "FRA",
}

NAME_FIXES_2013 = {
    **NAME_FIXES_2012,
    ("GHAFOOR", "Madiea"): ("GHAFOOR", "Madiea"),
}

HEAT_LINE_2013_RE = re.compile(r"^Heat\s+(?P<heat>\d+)\s+of\s+\d+(?:\s+Start\s+time:.*)?$", re.IGNORECASE)


def preprocess_line_2013(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "NNaammee": "Name",
        "NNaatt..": "Nat.",
        "GHAFOOR": "GHAFOOR",
        "LICHY Petrv": "LICHY Petr",
        "FAUNE Céderic": "FAUNE Cédric",
        "GÜNTHER": "GÜNTHER",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2013(raw):
    text = preprocess_line_2013(raw)
    normalized = (
        text.replace("Hürden", "Haies")
        .replace("hürden", "haies")
        .replace("Hurden", "Haies")
    )
    disc_match = TRACK_DISC_2013_RE.search(normalized)
    if not disc_match:
        return None
    return normalize_disc_2009(disc_match.group("disc").replace("Hürden", "Haies"))


def normalize_noc_2013(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2013.get(token) or COUNTRY_TOKEN_TO_NOC_2013.get(accentless) or token


def normalize_name_2013(last_name, first_name):
    return NAME_FIXES_2013.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2013(tokens):
    last_name, first_name = split_name_tokens_2009(tokens)
    return normalize_name_2013(last_name, first_name)


def normalize_perf_2013(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if raw.lower() == "w.v.t.":
        return "DNS", "DNS"

    m = re.match(r"^(\d+):(\d+),(\d+)$", raw)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    return normalize_perf_2009(raw, field_event=field_event)


def normalize_club_2013(team_token, noc):
    raw = str(team_token or "").strip().upper()
    if not raw:
        return ""
    normalized_team = normalize_noc_2013(raw)
    if normalized_team == noc:
        return ""
    return raw


def parse_field_header_2013(line):
    text = preprocess_line_2013(line)
    if "Continuation" in text:
        return None
    return FIELD_HEADERS_2013.get(text)


def parse_track_header_2013(line):
    text = preprocess_line_2013(line)
    if "Continuation" in text:
        return None

    m = TRACK_HEADER_2013_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender_2009(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2013(disc_raw)
    if not discipline:
        return None

    suffix_match = re.search(r"\b([ABC])$", disc_raw)
    suffix_group = suffix_match.group(1) if suffix_match else ""

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("vorlaufe"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower == "zeitlaufe":
        if suffix_group:
            round_value = "Final"
            final_group = suffix_group
            heat = suffix_group
        else:
            round_value = "Timed Final"
    elif label_lower.startswith("finale"):
        round_value = "Final"
    else:
        return None

    if round_value != "Heat" and not final_group:
        label_group_match = re.search(r"\b([ABC])$", label)
        final_group = label_group_match.group(1) if label_group_match else suffix_group
        if final_group:
            heat = final_group

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
        "_active_heat": "",
    }


def parse_track_result_line_2013(line, *, active_heat=""):
    text = preprocess_line_2013(line)
    tokens = text.split()
    if len(tokens) < 6:
        return None

    source_heat = active_heat
    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 6:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 3 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    nat_token = tokens[yob_idx + 1]
    team_token = tokens[yob_idx + 2]
    raw_result = tokens[yob_idx + 3]
    noc = normalize_noc_2013(nat_token)
    club = normalize_club_2013(team_token, noc)
    last_name, first_name = split_name_tokens_2013(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2013(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2013(line):
    text = preprocess_line_2013(line)
    tokens = text.split()
    if len(tokens) < 6:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 6:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 2 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    nat_token = tokens[yob_idx + 1]
    team_token = tokens[yob_idx + 2]
    raw_result = tokens[yob_idx + 3] if yob_idx + 3 < len(tokens) else ""
    if yob_idx + 4 < len(tokens) and tokens[yob_idx + 4].lower() == "m":
        raw_result = f"{raw_result} m"

    noc = normalize_noc_2013(nat_token)
    club = normalize_club_2013(team_token, noc)
    last_name, first_name = split_name_tokens_2013(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2013(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def dedupe_rows_2013(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
            row.get("notes", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2013(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None

    for page_no, page_text in enumerate(page_texts, start=1):
        for raw_line in page_text.splitlines():
            line = preprocess_line_2013(raw_line)
            if not line:
                continue

            heat_line_match = HEAT_LINE_2013_RE.match(line)
            if heat_line_match:
                if current and current.get("round") == "Heat":
                    current["_active_heat"] = heat_line_match.group("heat")
                continue

            if line in {"False start", "Fehlstart"}:
                if current and current.get("rows"):
                    current["rows"][-1]["notes"] = line
                continue

            if (
                line.startswith("Printed on ")
                or line.startswith("11. Dussmann Indoor Meeting V2 Results")
                or line.startswith("Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line.startswith("Hurdle's Height:")
            ):
                continue

            field_header = parse_field_header_2013(line)
            if field_header:
                discipline, gender = field_header
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                    "_active_heat": "",
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2013(line)
            if track_header:
                current = {**track_header, "rows": []}
                sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault", "Shot Put"}:
                parsed = parse_field_result_line_2013(line)
            else:
                parsed = parse_track_result_line_2013(line, active_heat=current.get("_active_heat", ""))

            if not parsed:
                continue

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2013-02-02"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2013(section["rows"]):
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": row.get("sourceHeat") or section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2014-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2014 = {
    "Hauteur, Hommes - Finale": ("High Jump", "M"),
    "Perche, Hommes - Finale": ("Pole Vault", "M"),
    "Hauteur, Dames - Finale": ("High Jump", "W"),
    "Perche , Dames - Finale": ("Pole Vault", "W"),
    "Weitsprung, Dames - Final": ("Long Jump", "W"),
}

TRACK_HEADER_2014_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Dames|Hommes)\s*-\s*"
    r"(?P<label>A-/?B-Final(?:e)?|Finale?(?:\s+[ABC])?|Final(?:\s+[ABC])?|Zeitl[aä]ufe|Vorl[aä]ufe)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2014_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+h[üu]rden|(?:\s+haies)?)?|60m\s+h[üu]rden|60m\s+haies|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2014 = {
    **COUNTRY_TOKEN_TO_NOC_2013,
    "FR": "FRA",
    "GEB": "GBR",
}

LOCAL_CLUB_CODES_2014 = {"CAEG", "CAS", "CAB", "CAPA", "CSL", "CELTIC", "FOLA", "CAD"}

NAME_FIXES_2014 = {
    **NAME_FIXES_2013,
    ("CONTRINGTON", "Giovanni"): ("CONTRINGTON", "Giovanni"),
    ("RODRIGUEZ LOPEZ", "Almudena"): ("RODRIGUEZ LOPEZ", "Almudena"),
}

HEAT_LINE_2014_RE = re.compile(r"^Heat\s+(?P<heat>\d+)\s+of\s+\d+(?:\s+Start\s+time:.*)?$", re.IGNORECASE)
FINAL_SUBLABEL_2014_RE = re.compile(r"^(?P<label>[AB]-Final)\s*$", re.IGNORECASE)
STANDARD_NOTE_MAP_2014 = {
    "Fehlstart": "False start",
    "False start": "False start",
    "Rule 162.6": "Rule 162.6",
    "Meeting Record": "Meeting Record",
    "National Record Indoor": "National Record Indoor",
    "National Record": "National Record Indoor",
    "Record national": "National Record Indoor",
}


def preprocess_line_2014(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "NNaammee": "Name",
        "NNaatt..": "Nat.",
        "CONTRINGTON": "CONTRINGTON",
        "RODRIGUEZ LOPEZ Almuden1a994": "RODRIGUEZ LOPEZ Almudena 1994",
        "Marten": "Marten",
        "Ned NED": "NED NED",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2014(raw):
    text = preprocess_line_2014(raw)
    normalized = (
        text.replace("Hürden", "Haies")
        .replace("hürden", "haies")
        .replace("Hurden", "Haies")
    )
    disc_match = TRACK_DISC_2014_RE.search(normalized)
    if not disc_match:
        return None
    return normalize_disc_2009(disc_match.group("disc").replace("Hürden", "Haies"))


def normalize_noc_2014(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2014.get(token) or COUNTRY_TOKEN_TO_NOC_2014.get(accentless) or token


def normalize_name_2014(last_name, first_name):
    return NAME_FIXES_2014.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2014(tokens):
    last_name, first_name = split_name_tokens_2009(tokens)
    return normalize_name_2014(last_name, first_name)


def normalize_perf_2014(raw, *, field_event=False):
    raw = str(raw or "").strip()
    if not raw:
        return "", None

    if raw.lower() == "w.v.t.":
        return "DNS", "DNS"

    m = re.match(r"^(\d+):(\d+),(\d+)$", raw)
    if m:
        return f"{int(m.group(1))}:{m.group(2)}.{m.group(3)}", "OK"

    return normalize_perf_2009(raw, field_event=field_event)


def normalize_club_2014(team_token, noc):
    raw = str(team_token or "").strip().upper()
    if not raw:
        return ""
    normalized_team = normalize_noc_2014(raw)
    if normalized_team == noc:
        return ""
    return raw


def infer_noc_and_club_2014(tokens_after_yob):
    parts = [str(token or "").strip() for token in tokens_after_yob if str(token or "").strip()]
    if not parts:
        return "", ""

    if len(parts) == 1:
        token = parts[0]
        normalized = normalize_noc_2014(token)
        if token.upper() in LOCAL_CLUB_CODES_2014:
            return "LUX", token.upper()
        return normalized, ""

    nat_token = parts[0]
    team_token = parts[1]
    normalized_nat = normalize_noc_2014(nat_token)

    if nat_token.upper() in LOCAL_CLUB_CODES_2014 and team_token.upper() not in LOCAL_CLUB_CODES_2014:
        return "LUX", nat_token.upper()

    if normalized_nat == nat_token.upper() and nat_token.upper() not in COUNTRY_TOKEN_TO_NOC_2014 and len(nat_token) > 3:
        return "LUX", nat_token.upper()

    return normalized_nat, normalize_club_2014(team_token, normalized_nat)


def parse_field_header_2014(line):
    text = preprocess_line_2014(line)
    if "Continuation" in text:
        return None
    return FIELD_HEADERS_2014.get(text)


def parse_track_header_2014(line):
    text = preprocess_line_2014(line)
    m = TRACK_HEADER_2014_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender_2009(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2014(disc_raw)
    if not discipline:
        return None

    suffix_match = re.search(r"\b([ABC])$", disc_raw)
    suffix_group = suffix_match.group(1) if suffix_match else ""
    continuation = "Continuation" in text

    if label_lower.startswith("a-/b-final"):
        return {
            "discipline": discipline,
            "gender": gender,
            "round": "Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
            "rawHeader": text,
            "_ab_parent": True,
            "_continuation": continuation,
            "_active_heat": "",
        }

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("vorlaufe"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower == "zeitlaufe":
        if suffix_group:
            round_value = "Final"
            final_group = suffix_group
            heat = suffix_group
        else:
            round_value = "Timed Final"
    elif label_lower.startswith("finale") or label_lower.startswith("final"):
        round_value = "Final"
    else:
        return None

    if round_value != "Heat" and not final_group:
        label_group_match = re.search(r"\b([ABC])$", label)
        final_group = label_group_match.group(1) if label_group_match else suffix_group
        if final_group:
            heat = final_group

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
        "_ab_parent": False,
        "_continuation": continuation,
        "_active_heat": "",
    }


def parse_track_result_line_2014(line, *, active_heat=""):
    text = preprocess_line_2014(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    source_heat = active_heat
    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2014(context_tokens)
    last_name, first_name = split_name_tokens_2014(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2014(line):
    text = preprocess_line_2014(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-2] if len(tokens) >= 2 and tokens[-1].lower() == "m" else tokens[-1]
    if len(tokens) >= 2 and tokens[-1].lower() == "m":
        raw_result = f"{raw_result} m"

    context_end = -2 if tokens[-1].lower() == "m" else -1
    context_tokens = tokens[yob_idx + 1:context_end]
    noc, club = infer_noc_and_club_2014(context_tokens)
    last_name, first_name = split_name_tokens_2014(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def standardize_note_2014(line):
    text = preprocess_line_2014(line)
    return STANDARD_NOTE_MAP_2014.get(text)


def append_note_2014(row, note):
    if not row or not note:
        return
    existing = [part.strip() for part in str(row.get("notes") or "").split(";") if part.strip()]
    if note not in existing:
        existing.append(note)
    row["notes"] = "; ".join(existing)


def dedupe_rows_2014(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
            row.get("notes", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2014(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    current_ab_parent = None

    for page_no, page_text in enumerate(page_texts, start=1):
        for raw_line in page_text.splitlines():
            line = preprocess_line_2014(raw_line)
            if not line:
                continue

            note = standardize_note_2014(line)
            if note:
                if current and current.get("rows"):
                    append_note_2014(current["rows"][-1], note)
                continue

            heat_line_match = HEAT_LINE_2014_RE.match(line)
            if heat_line_match:
                if current and current.get("round") == "Heat":
                    current["_active_heat"] = heat_line_match.group("heat")
                continue

            final_sublabel_match = FINAL_SUBLABEL_2014_RE.match(line)
            if final_sublabel_match and current_ab_parent:
                label = final_sublabel_match.group("label").upper()
                group = "A" if label.startswith("A-") else "B"
                current = {
                    "discipline": current_ab_parent["discipline"],
                    "gender": current_ab_parent["gender"],
                    "round": "Final",
                    "heat": group,
                    "finalGroup": group,
                    "linkedRound": "",
                    "rawHeader": current_ab_parent["rawHeader"],
                    "rows": [],
                    "_active_heat": "",
                }
                sections.append(current)
                continue

            if (
                line.startswith("Printed on ")
                or line.startswith("12. FLA Indoor Meeting Results")
                or line.startswith("Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line.startswith("Qualified are the ")
                or line.startswith("Hurdle's Height:")
            ):
                continue

            field_header = parse_field_header_2014(line)
            if field_header:
                discipline, gender = field_header
                current_ab_parent = None
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                    "_active_heat": "",
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2014(line)
            if track_header:
                if track_header["_ab_parent"]:
                    current_ab_parent = track_header
                    current = None
                elif track_header["_continuation"] and track_header["round"] == "Heat":
                    # Keep appending to the existing heat section across continuation pages.
                    pass
                else:
                    current_ab_parent = None
                    current = {k: v for k, v in track_header.items() if not k.startswith("_")}
                    current["rows"] = []
                    current["_active_heat"] = ""
                    sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault", "Shot Put", "Long Jump"}:
                parsed = parse_field_result_line_2014(line)
            else:
                parsed = parse_track_result_line_2014(line, active_heat=current.get("_active_heat", ""))

            if not parsed:
                continue

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2014-02-01"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2014(section["rows"]):
            results.append({
                "rank": row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": row.get("sourceHeat") or section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2015-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2015 = {
    "Hauteur, Hommes - Finale": ("High Jump", "M"),
    "Poids, Hommes - Finale": ("Shot Put", "M"),
    "Hauteur, Dames - Finale": ("High Jump", "W"),
    "Perche , Dames - Finale": ("Pole Vault", "W"),
    "Longueur, Dames - Finale": ("Long Jump", "W"),
}

TRACK_HEADER_2015_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Dames|Hommes)\s*-\s*"
    r"(?P<label>A-/?B-Final(?:e)?|Finale?(?:\s+[ABC])?|Zeitl[aä]ufe|Vorl[aä]ufe)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2015_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+haies)?|60m\s+haies|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2015 = {
    **COUNTRY_TOKEN_TO_NOC_2014,
    "CZA": "CZE",
}

HEAT_LINE_2015_RE = re.compile(r"^Heat\s+(?P<heat>\d+)\s+of\s+\d+(?:\s+Start\s+time:.*)?$", re.IGNORECASE)
FINAL_SUBLABEL_2015_RE = re.compile(r"^(?P<label>[AB]-Final)\s*$", re.IGNORECASE)
PLACEMENT_TOKEN_2015_RE = re.compile(r"^(?P<place>\d+)\./(?P<heat>[IVX]+)$", re.IGNORECASE)
ROMAN_FINAL_TO_NUMBER_2015 = {
    "I": "1",
    "II": "2",
    "III": "3",
}
STANDARD_NOTE_MAP_2015 = {
    "Faux départ": "False start",
    "False start": "False start",
    "Rule 162.6": "Rule 162.6",
    "Nouveau Record National": "National Record Indoor",
    "Nouveau record national": "National Record Indoor",
    "National Record Juniors Espoir Seniors": "National Record Indoor U20; National Record Indoor U23; National Record Indoor Senior",
}


def preprocess_line_2015(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "NNaatt..": "Nat.",
        "NNaammee": "Name",
        "GÜNTHER": "GÜNTHER",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2015(raw):
    text = preprocess_line_2015(raw)
    disc_match = TRACK_DISC_2015_RE.search(text)
    if not disc_match:
        return None
    return normalize_disc_2009(disc_match.group("disc"))


def normalize_noc_2015(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2015.get(token) or COUNTRY_TOKEN_TO_NOC_2015.get(accentless) or token


def normalize_club_2015(team_token, noc):
    raw = str(team_token or "").strip().upper()
    if not raw:
        return ""
    normalized_team = normalize_noc_2015(raw)
    if normalized_team == noc:
        return ""
    if re.match(r"^[A-Z]{3}$", normalized_team):
        return ""
    return raw


def infer_noc_and_club_2015(tokens_after_yob):
    parts = [str(token or "").strip() for token in tokens_after_yob if str(token or "").strip()]
    if not parts:
        return "", ""

    if len(parts) == 1:
        token = parts[0]
        return normalize_noc_2015(token), ""

    nat_token = parts[0]
    team_token = parts[1]
    normalized_nat = normalize_noc_2015(nat_token)
    return normalized_nat, normalize_club_2015(team_token, normalized_nat)


def parse_field_header_2015(line):
    text = preprocess_line_2015(line)
    if "Continuation" in text:
        return None
    return FIELD_HEADERS_2015.get(text)


def parse_track_header_2015(line):
    text = preprocess_line_2015(line)
    m = TRACK_HEADER_2015_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender_2009(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2015(disc_raw)
    if not discipline:
        return None

    suffix_match = re.search(r"\b([ABC])$", disc_raw)
    suffix_group = suffix_match.group(1) if suffix_match else ""

    if label_lower.startswith("a-/b-final"):
        if discipline == "800m" and gender == "M":
            return {
                "discipline": discipline,
                "gender": gender,
                "round": "Final",
                "heat": "",
                "finalGroup": "",
                "linkedRound": "",
                "rawHeader": text,
                "_ab_parent": False,
                "_source_finals_1_2": True,
                "_active_heat": "",
            }
        return {
            "discipline": discipline,
            "gender": gender,
            "round": "Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
            "rawHeader": text,
            "_ab_parent": True,
            "_source_finals_1_2": False,
            "_active_heat": "",
        }

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("vorlaufe"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower == "zeitlaufe":
        if suffix_group:
            round_value = "Final"
            final_group = suffix_group
            heat = suffix_group
        else:
            round_value = "Timed Final"
    elif label_lower.startswith("finale"):
        round_value = "Final"
    else:
        return None

    if round_value != "Heat" and not final_group:
        label_group_match = re.search(r"\b([ABC])$", label)
        final_group = label_group_match.group(1) if label_group_match else suffix_group
        if final_group:
            heat = final_group

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
        "_ab_parent": False,
        "_source_finals_1_2": False,
        "_active_heat": "",
    }


def parse_track_result_line_2015(line, *, active_heat="", use_source_finals=False):
    text = preprocess_line_2015(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    source_heat = active_heat
    section_rank_override = None
    global_rank = None

    placement_match = PLACEMENT_TOKEN_2015_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_FINAL_TO_NUMBER_2015.get(placement_match.group("heat").upper(), "")
        section_rank_override = int(placement_match.group("place"))
        tokens = tokens[:-1]

    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        global_rank = rank
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2015(context_tokens)
    last_name, first_name = split_name_tokens_2014(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result)
    section_rank = section_rank_override if use_source_finals and section_rank_override is not None else rank

    return {
        "sectionRank": section_rank,
        "globalRank": global_rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2015(line):
    text = preprocess_line_2015(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-2] if len(tokens) >= 2 and tokens[-1].lower() == "m" else tokens[-1]
    if len(tokens) >= 2 and tokens[-1].lower() == "m":
        raw_result = f"{raw_result} m"

    context_end = -2 if tokens[-1].lower() == "m" else -1
    context_tokens = tokens[yob_idx + 1:context_end]
    noc, club = infer_noc_and_club_2015(context_tokens)
    last_name, first_name = split_name_tokens_2014(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "globalRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def standardize_note_2015(line):
    text = preprocess_line_2015(line)
    return STANDARD_NOTE_MAP_2015.get(text)


def append_note_2015(row, note):
    if not row or not note:
        return
    existing = [part.strip() for part in str(row.get("notes") or "").split(";") if part.strip()]
    new_parts = [part.strip() for part in str(note).split(";") if part.strip()]
    for item in new_parts:
        if item not in existing:
            existing.append(item)
    row["notes"] = "; ".join(existing)


def dedupe_rows_2015(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
            row.get("notes", ""),
            row.get("globalRank"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2015(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    current_ab_parent = None

    for page_text in page_texts:
        for raw_line in page_text.splitlines():
            line = preprocess_line_2015(raw_line)
            if not line:
                continue

            note = standardize_note_2015(line)
            if note:
                if current and current.get("rows"):
                    append_note_2015(current["rows"][-1], note)
                continue

            heat_line_match = HEAT_LINE_2015_RE.match(line)
            if heat_line_match:
                if current and current.get("round") == "Heat":
                    current["_active_heat"] = heat_line_match.group("heat")
                continue

            final_sublabel_match = FINAL_SUBLABEL_2015_RE.match(line)
            if final_sublabel_match and current_ab_parent:
                label = final_sublabel_match.group("label").upper()
                group = "A" if label.startswith("A-") else "B"
                current = {
                    "discipline": current_ab_parent["discipline"],
                    "gender": current_ab_parent["gender"],
                    "round": "Final",
                    "heat": group,
                    "finalGroup": group,
                    "linkedRound": "",
                    "rawHeader": current_ab_parent["rawHeader"],
                    "rows": [],
                    "_active_heat": "",
                    "_source_finals_1_2": False,
                }
                sections.append(current)
                continue

            if (
                line.startswith("Printed on ")
                or line.startswith("VECTIS INDOOR MEETING")
                or line.startswith("Results Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line.startswith("Hurdle's Height:")
                or re.match(r"^(?:-?T\d\s+){2,}-?T\d\s*$", line)
                or re.match(r"^\d+(?:,\d{2}|\.\d{2})?(?:\s+\d+(?:,\d{2}|\.\d{2})?)*$", line)
            ):
                continue

            field_header = parse_field_header_2015(line)
            if field_header:
                discipline, gender = field_header
                current_ab_parent = None
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                    "_active_heat": "",
                    "_source_finals_1_2": False,
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2015(line)
            if track_header:
                if track_header["_ab_parent"]:
                    current_ab_parent = track_header
                    current = None
                else:
                    current_ab_parent = None
                    current = {k: v for k, v in track_header.items() if not k.startswith("_")}
                    current["rows"] = []
                    current["_active_heat"] = ""
                    current["_source_finals_1_2"] = track_header.get("_source_finals_1_2", False)
                    sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault", "Shot Put", "Long Jump"}:
                parsed = parse_field_result_line_2015(line)
            else:
                parsed = parse_track_result_line_2015(
                    line,
                    active_heat=current.get("_active_heat", ""),
                    use_source_finals=current.get("_source_finals_1_2", False),
                )

            if not parsed:
                continue

            if current.get("_source_finals_1_2") and parsed.get("sourceHeat"):
                current["_active_heat"] = parsed["sourceHeat"]
            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2015-02-07"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2015(section["rows"]):
            source_final = row.get("sourceHeat") if section.get("_source_finals_1_2") else ""
            results.append({
                "rank": row.get("globalRank") or row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": source_final or row.get("sourceHeat") or section["heat"],
                "finalGroup": source_final or section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2016-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2016 = {
    "High Jump, Women - Final": ("High Jump", "W"),
    "Pole Vault, Women - Final": ("Pole Vault", "W"),
    "Shot Put, Women - Final": ("Shot Put", "W"),
    "High Jump, Men - Final": ("High Jump", "M"),
    "Shot Put F42, Men - Final": ("Shot Put F42", "M"),
}

TRACK_HEADER_2016_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Women|Men)\s*-\s*"
    r"(?P<label>A-/?B-Final(?:e)?|Finale?(?:\s+[ABC])?|Heats?|Timed\s+heats?)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2016_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+hurdles)?|400m|800m|1500m|3000m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2016 = {
    **COUNTRY_TOKEN_TO_NOC_2015,
    "ROM": "ROU",
}

NAME_FIXES_2016 = {
    ("GIRARD MONDOLINI", "Elisa"): ("GIRARD-MONDOLINI", "Elisa"),
    ("SEDOC", "Grégorie"): ("SEDOC", "Grégoire"),
    ("SEMEDO MONTEIRO", "Edna Mari"): ("SEMEDO MONTEIRO", "Edna Marie"),
}

HEAT_LINE_2016_RE = re.compile(r"^Heat\s+(?P<heat>\d+)\s+of\s+\d+(?:\s+Start\s+time:.*)?$", re.IGNORECASE)
FINAL_SUBLABEL_2016_RE = re.compile(r"^(?P<label>[AB]-Final)\s*$", re.IGNORECASE)
PLACEMENT_TOKEN_2016_RE = re.compile(r"^(?P<place>\d+)\./(?P<heat>[IVX]+)$", re.IGNORECASE)
ROMAN_FINAL_TO_NUMBER_2016 = {
    "I": "1",
    "II": "2",
    "III": "3",
}
FIELD_RECORD_DISCIPLINES_2016 = {"High Jump", "Pole Vault", "Shot Put", "Shot Put F42", "Long Jump"}


def preprocess_line_2016(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "MÖHLENKAMP": "MÖHLENKAMP",
        "BÜHLER": "BÜHLER",
        "MÄHLMANN": "MÄHLMANN",
        "SEMEDO MONTEIRO Edna Ma1r9i91": "SEMEDO MONTEIRO Edna Mari 1991",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2016(raw):
    text = preprocess_line_2016(raw)
    normalized = text.replace("Hurdles", "Hurdles")
    disc_match = TRACK_DISC_2016_RE.search(normalized)
    if not disc_match:
        return None
    return normalize_disc_2009(disc_match.group("disc").replace("Hurdles", "Hurdles"))


def normalize_noc_2016(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2016.get(token) or COUNTRY_TOKEN_TO_NOC_2016.get(accentless) or token


def normalize_club_2016(team_token, noc):
    raw = str(team_token or "").strip().upper()
    if not raw:
        return ""
    normalized_team = normalize_noc_2016(raw)
    if normalized_team == noc:
        return ""
    if re.match(r"^[A-Z]{3}$", normalized_team):
        return ""
    return raw


def normalize_name_2016(last_name, first_name):
    return NAME_FIXES_2016.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2016(tokens):
    last_name, first_name = split_name_tokens_2014(tokens)
    return normalize_name_2016(last_name, first_name)


def infer_noc_and_club_2016(tokens_after_yob):
    parts = [str(token or "").strip() for token in tokens_after_yob if str(token or "").strip()]
    if not parts:
        return "", ""

    if len(parts) == 1:
        token = parts[0]
        return normalize_noc_2016(token), ""

    nat_token = parts[0]
    team_token = parts[1]
    normalized_nat = normalize_noc_2016(nat_token)
    return normalized_nat, normalize_club_2016(team_token, normalized_nat)


def parse_field_header_2016(line):
    text = preprocess_line_2016(line)
    if "Continuation" in text:
        return None
    return FIELD_HEADERS_2016.get(text)


def parse_track_header_2016(line):
    text = preprocess_line_2016(line)
    m = TRACK_HEADER_2016_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2016(disc_raw)
    if not discipline:
        return None

    if label_lower.startswith("a-/b-final"):
        if discipline == "400m":
            return {
                "discipline": discipline,
                "gender": gender,
                "round": "Final",
                "heat": "",
                "finalGroup": "",
                "linkedRound": "",
                "rawHeader": text,
                "_ab_parent": False,
                "_source_finals_1_2": True,
                "_active_heat": "",
            }
        return {
            "discipline": discipline,
            "gender": gender,
            "round": "Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
            "rawHeader": text,
            "_ab_parent": True,
            "_source_finals_1_2": False,
            "_active_heat": "",
        }

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("heat"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower.startswith("timed heat"):
        round_value = "Timed Final"
    elif label_lower.startswith("final"):
        round_value = "Final"
    else:
        return None

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
        "_ab_parent": False,
        "_source_finals_1_2": False,
        "_active_heat": "",
    }


def parse_track_result_line_2016(line, *, active_heat="", use_source_finals=False):
    text = preprocess_line_2016(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    source_heat = active_heat
    section_rank_override = None
    global_rank = None

    placement_match = PLACEMENT_TOKEN_2016_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_FINAL_TO_NUMBER_2016.get(placement_match.group("heat").upper(), "")
        section_rank_override = int(placement_match.group("place"))
        tokens = tokens[:-1]

    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        global_rank = rank
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2016(context_tokens)
    last_name, first_name = split_name_tokens_2016(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result)
    section_rank = section_rank_override if use_source_finals and section_rank_override is not None else rank

    return {
        "sectionRank": section_rank,
        "globalRank": global_rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2016(line):
    text = preprocess_line_2016(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-2] if len(tokens) >= 2 and tokens[-1].lower() == "m" else tokens[-1]
    if len(tokens) >= 2 and tokens[-1].lower() == "m":
        raw_result = f"{raw_result} m"

    context_end = -2 if tokens[-1].lower() == "m" else -1
    context_tokens = tokens[yob_idx + 1:context_end]
    noc, club = infer_noc_and_club_2016(context_tokens)
    last_name, first_name = split_name_tokens_2016(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "globalRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def standardize_note_2016(line, discipline=""):
    text = preprocess_line_2016(line)
    lower = _strip_accents(text).lower()

    if "vectis indoor" in lower and "record" in lower:
        return "Meeting Record"

    if lower == "new national record":
        if discipline in FIELD_RECORD_DISCIPLINES_2016:
            return "National Record"
        return "National Record Indoor"

    return None


def append_note_2016(row, note):
    if not row or not note:
        return
    existing = [part.strip() for part in str(row.get("notes") or "").split(";") if part.strip()]
    new_parts = [part.strip() for part in str(note).split(";") if part.strip()]
    for item in new_parts:
        if item not in existing:
            existing.append(item)
    row["notes"] = "; ".join(existing)


def dedupe_rows_2016(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
            row.get("notes", ""),
            row.get("globalRank"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2016(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    current_ab_parent = None

    for page_text in page_texts:
        for raw_line in page_text.splitlines():
            line = preprocess_line_2016(raw_line)
            if not line:
                continue

            note = standardize_note_2016(line, current["discipline"] if current else "")
            if note:
                if current and current.get("rows"):
                    append_note_2016(current["rows"][-1], note)
                continue

            heat_line_match = HEAT_LINE_2016_RE.match(line)
            if heat_line_match:
                if current and current.get("round") in {"Heat", "Timed Final"}:
                    current["_active_heat"] = heat_line_match.group("heat")
                continue

            final_sublabel_match = FINAL_SUBLABEL_2016_RE.match(line)
            if final_sublabel_match and current_ab_parent:
                label = final_sublabel_match.group("label").upper()
                group = "A" if label.startswith("A-") else "B"
                current = {
                    "discipline": current_ab_parent["discipline"],
                    "gender": current_ab_parent["gender"],
                    "round": "Final",
                    "heat": group,
                    "finalGroup": group,
                    "linkedRound": "",
                    "rawHeader": current_ab_parent["rawHeader"],
                    "rows": [],
                    "_active_heat": "",
                    "_source_finals_1_2": False,
                }
                sections.append(current)
                continue

            if (
                line.startswith("Printed on ")
                or line.startswith("14. Vectis Indoor Meeting")
                or line.startswith("Results Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line.startswith("Qualified are the ")
                or line.startswith("Hurdle's Height:")
                or re.match(r"^(?:-?T\d\s+){2,}-?T\d\s*$", line)
                or re.match(r"^\d+(?:,\d{2}|\.\d{2})?(?:\s+\d+(?:,\d{2}|\.\d{2})?)*$", line)
                or line == "-"
            ):
                continue

            field_header = parse_field_header_2016(line)
            if field_header:
                discipline, gender = field_header
                current_ab_parent = None
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                    "_active_heat": "",
                    "_source_finals_1_2": False,
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2016(line)
            if track_header:
                if track_header["_ab_parent"]:
                    current_ab_parent = track_header
                    current = None
                else:
                    current_ab_parent = None
                    current = {k: v for k, v in track_header.items() if not k.startswith("_")}
                    current["rows"] = []
                    current["_active_heat"] = ""
                    current["_source_finals_1_2"] = track_header.get("_source_finals_1_2", False)
                    sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault", "Shot Put", "Shot Put F42", "Long Jump"}:
                parsed = parse_field_result_line_2016(line)
            else:
                parsed = parse_track_result_line_2016(
                    line,
                    active_heat=current.get("_active_heat", ""),
                    use_source_finals=current.get("_source_finals_1_2", False),
                )

            if not parsed:
                continue

            if current.get("_source_finals_1_2") and parsed.get("sourceHeat"):
                current["_active_heat"] = parsed["sourceHeat"]
            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2016-01-30"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        rows = dedupe_rows_2016(section["rows"])
        for row in rows:
            source_final = row.get("sourceHeat") if section.get("_source_finals_1_2") else ""
            results.append({
                "rank": row.get("globalRank") or row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": source_final or row.get("sourceHeat") or section["heat"],
                "finalGroup": source_final or section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2017-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2017 = {
    "High Jump, Men - Final": ("High Jump", "M"),
    "Long Jump, Men - Final": ("Long Jump", "M"),
    "High Jump, Women - Final": ("High Jump", "W"),
    "Pole Vault, Women - Final": ("Pole Vault", "W"),
}

TRACK_HEADER_2017_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Women|Men)\s*-\s*"
    r"(?P<label>A-/?B-Final(?:e)?|Finale?|Heats?|Zeitl[aä]ufe)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2017_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+hurdles)?|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2017 = {
    **COUNTRY_TOKEN_TO_NOC_2016,
}

NAME_FIXES_2017 = {
    **NAME_FIXES_2016,
    ("DE VOCHT", "Elien"): ("DE VOCHT", "Elien"),
}

HEAT_LINE_2017_RE = re.compile(r"^Heat\s+(?P<heat>\d+)\s+of\s+\d+(?:\s+Start\s+time:.*)?$", re.IGNORECASE)
FINAL_SUBLABEL_2017_RE = re.compile(r"^(?P<label>[AB]-Final)\s*$", re.IGNORECASE)
PLACEMENT_TOKEN_2017_RE = re.compile(r"^(?P<place>\d+)\./(?P<heat>[IVX]+)$", re.IGNORECASE)
ROMAN_FINAL_TO_NUMBER_2017 = {
    "I": "1",
    "II": "2",
    "III": "3",
}
FIELD_RECORD_DISCIPLINES_2017 = {"High Jump", "Pole Vault", "Shot Put", "Shot Put F42", "Long Jump"}


def preprocess_line_2017(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "SEMEDO MONTEIRO Edna Mari": "SEMEDO MONTEIRO Edna Mari",
        "MOHAMED HASSAN Basant Mo": "MOHAMED HASSAN Basant Mo",
        "CLAUDE-BOXBERGER": "CLAUDE-BOXBERGER",
        "CLAUDE-BOXBERGER Ophél1ie988": "CLAUDE-BOXBERGER Ophélie 1988",
        "SEMEDO MONTEIRO Edna Ma1r9i91": "SEMEDO MONTEIRO Edna Mari 1991",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2017(raw):
    text = preprocess_line_2017(raw)
    disc_match = TRACK_DISC_2017_RE.search(text)
    if not disc_match:
        return None
    return normalize_disc_2009(disc_match.group("disc"))


def normalize_noc_2017(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2017.get(token) or COUNTRY_TOKEN_TO_NOC_2017.get(accentless) or token


def normalize_club_2017(team_token, noc):
    raw = str(team_token or "").strip().upper()
    if not raw:
        return ""
    normalized_team = normalize_noc_2017(raw)
    if normalized_team == noc:
        return ""
    if re.match(r"^[A-Z]{3}$", normalized_team):
        return ""
    return raw


def normalize_name_2017(last_name, first_name):
    return NAME_FIXES_2017.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2017(tokens):
    last_name, first_name = split_name_tokens_2014(tokens)
    return normalize_name_2017(last_name, first_name)


def infer_noc_and_club_2017(tokens_after_yob):
    parts = [str(token or "").strip() for token in tokens_after_yob if str(token or "").strip()]
    if not parts:
        return "", ""

    if len(parts) == 1:
        token = parts[0]
        return normalize_noc_2017(token), ""

    nat_token = parts[0]
    team_token = parts[1]
    normalized_nat = normalize_noc_2017(nat_token)
    return normalized_nat, normalize_club_2017(team_token, normalized_nat)


def parse_field_header_2017(line):
    text = preprocess_line_2017(line)
    continuation = text.endswith(" - Continuation")
    if continuation:
        text = text[: -len(" - Continuation")]
    value = FIELD_HEADERS_2017.get(text)
    if not value:
        return None
    discipline, gender = value
    return {"discipline": discipline, "gender": gender, "continuation": continuation}


def parse_track_header_2017(line):
    text = preprocess_line_2017(line)
    continuation = text.endswith(" - Continuation")
    m = TRACK_HEADER_2017_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2017(disc_raw)
    if not discipline:
        return None

    if discipline == "60m" and gender == "M" and label_lower == "zeitlaufe":
        return {
            "discipline": discipline,
            "gender": gender,
            "round": "Timed Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
            "rawHeader": text,
            "_ab_parent": False,
            "_source_finals_1_2": False,
            "_skip_section": True,
            "_continuation": continuation,
            "_active_heat": "",
        }

    if label_lower.startswith("a-/b-final"):
        if discipline == "60m":
            return {
                "discipline": discipline,
                "gender": gender,
                "round": "Final",
                "heat": "",
                "finalGroup": "",
                "linkedRound": "",
                "rawHeader": text,
                "_ab_parent": True,
                "_source_finals_1_2": False,
                "_skip_section": False,
                "_continuation": continuation,
                "_active_heat": "",
            }
        if discipline == "400m":
            return {
                "discipline": discipline,
                "gender": gender,
                "round": "Final",
                "heat": "",
                "finalGroup": "",
                "linkedRound": "",
                "rawHeader": text,
                "_ab_parent": False,
                "_source_finals_1_2": True,
                "_skip_section": False,
                "_continuation": continuation,
                "_active_heat": "",
            }

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""
    source_finals = False

    if label_lower.startswith("heat"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower.startswith("final"):
        round_value = "Final"
    elif label_lower.startswith("zeitlaufe"):
        round_value = "Timed Final"
    else:
        return None

    if (discipline, gender, round_value) in {
        ("800m", "M", "Final"),
        ("1500m", "W", "Final"),
    }:
        source_finals = True

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
        "_ab_parent": False,
        "_source_finals_1_2": source_finals,
        "_skip_section": False,
        "_continuation": continuation,
        "_active_heat": "",
    }


def parse_track_result_line_2017(line, *, active_heat="", use_source_finals=False):
    text = preprocess_line_2017(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    source_heat = active_heat
    section_rank_override = None
    global_rank = None

    placement_match = PLACEMENT_TOKEN_2017_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_FINAL_TO_NUMBER_2017.get(placement_match.group("heat").upper(), "")
        section_rank_override = int(placement_match.group("place"))
        tokens = tokens[:-1]

    qualification = ""
    notes = ""
    if tokens and tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        global_rank = rank
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2017(context_tokens)
    last_name, first_name = split_name_tokens_2017(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result)
    section_rank = section_rank_override if use_source_finals and section_rank_override is not None else rank

    return {
        "sectionRank": section_rank,
        "globalRank": global_rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
    }


def parse_field_result_line_2017(line):
    text = preprocess_line_2017(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-2] if len(tokens) >= 2 and tokens[-1].lower() == "m" else tokens[-1]
    if len(tokens) >= 2 and tokens[-1].lower() == "m":
        raw_result = f"{raw_result} m"

    context_end = -2 if tokens[-1].lower() == "m" else -1
    context_tokens = tokens[yob_idx + 1:context_end]
    noc, club = infer_noc_and_club_2017(context_tokens)
    last_name, first_name = split_name_tokens_2017(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "globalRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
    }


def standardize_note_2017(line, discipline=""):
    text = preprocess_line_2017(line)
    lower = _strip_accents(text).lower()

    if lower == "meeting record":
        return "Meeting Record"
    if lower == "national record":
        if discipline in FIELD_RECORD_DISCIPLINES_2017:
            return "National Record"
        return "National Record Indoor"
    if lower == "national record espoirs":
        if discipline in FIELD_RECORD_DISCIPLINES_2017:
            return "National Record U23"
        return "National Record Indoor U23"
    if lower == "rule 162.7":
        return "Rule 162.7"
    if lower == "rule 145.2":
        return "Rule 145.2"
    return None


def append_note_2017(row, note):
    if not row or not note:
        return
    existing = [part.strip() for part in str(row.get("notes") or "").split(";") if part.strip()]
    new_parts = [part.strip() for part in str(note).split(";") if part.strip()]
    for item in new_parts:
        if item not in existing:
            existing.append(item)
    row["notes"] = "; ".join(existing)


def dedupe_rows_2017(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
            row.get("notes", ""),
            row.get("globalRank"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2017(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    current_ab_parent = None

    def find_existing_section(discipline, gender, round_value):
        for section in reversed(sections):
            if (
                section.get("discipline") == discipline
                and section.get("gender") == gender
                and section.get("round") == round_value
            ):
                return section
        return None

    for page_text in page_texts:
        for raw_line in page_text.splitlines():
            line = preprocess_line_2017(raw_line)
            if not line:
                continue

            note = standardize_note_2017(line, current["discipline"] if current else "")
            if note:
                if current and current.get("rows"):
                    append_note_2017(current["rows"][-1], note)
                continue

            heat_line_match = HEAT_LINE_2017_RE.match(line)
            if heat_line_match:
                if current and current.get("round") in {"Heat", "Timed Final", "Final"}:
                    current["_active_heat"] = heat_line_match.group("heat")
                continue

            final_sublabel_match = FINAL_SUBLABEL_2017_RE.match(line)
            if final_sublabel_match and current_ab_parent:
                label = final_sublabel_match.group("label").upper()
                group = "A" if label.startswith("A-") else "B"
                current = {
                    "discipline": current_ab_parent["discipline"],
                    "gender": current_ab_parent["gender"],
                    "round": "Final",
                    "heat": group,
                    "finalGroup": group,
                    "linkedRound": "",
                    "rawHeader": current_ab_parent["rawHeader"],
                    "rows": [],
                    "_active_heat": "",
                    "_source_finals_1_2": False,
                }
                sections.append(current)
                continue

            if (
                line.startswith("Printed on ")
                or line == "VECTIS Indoor Meeting"
                or line.startswith("Results Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Rk. Name Name ")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line == "Final - Continuation"
                or line.startswith("Qualified are the ")
                or line.startswith("Hurdle's Height:")
                or re.match(r"^(?:-?T\d\s+){2,}-?T\d\s*$", line)
                or re.match(r"^\d+(?:,\d{2}|\.\d{2})?(?:\s+\d+(?:,\d{2}|\.\d{2})?)*$", line)
            ):
                continue

            field_header = parse_field_header_2017(line)
            if field_header:
                discipline = field_header["discipline"]
                gender = field_header["gender"]
                current_ab_parent = None
                if field_header["continuation"]:
                    existing = find_existing_section(discipline, gender, "Final")
                    if existing:
                        current = existing
                        continue
                current = {
                    "discipline": discipline,
                    "gender": gender,
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                    "_active_heat": "",
                    "_source_finals_1_2": False,
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2017(line)
            if track_header:
                if track_header["_skip_section"]:
                    current_ab_parent = None
                    current = None
                    continue
                if track_header["_ab_parent"]:
                    current_ab_parent = track_header
                    current = None
                    continue

                current_ab_parent = None
                if track_header["_continuation"]:
                    existing = find_existing_section(
                        track_header["discipline"],
                        track_header["gender"],
                        track_header["round"],
                    )
                    if existing:
                        current = existing
                        continue

                current = {k: v for k, v in track_header.items() if not k.startswith("_")}
                current["rows"] = []
                current["_active_heat"] = ""
                current["_source_finals_1_2"] = track_header.get("_source_finals_1_2", False)
                sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault", "Shot Put", "Shot Put F42", "Long Jump"}:
                parsed = parse_field_result_line_2017(line)
            else:
                parsed = parse_track_result_line_2017(
                    line,
                    active_heat=current.get("_active_heat", ""),
                    use_source_finals=current.get("_source_finals_1_2", False),
                )

            if not parsed:
                continue

            if current.get("_source_finals_1_2") and parsed.get("sourceHeat"):
                current["_active_heat"] = parsed["sourceHeat"]
            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2017-02-10"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2017(section["rows"]):
            source_final = row.get("sourceHeat") if section.get("_source_finals_1_2") else ""
            results.append({
                "rank": row.get("globalRank") or row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": source_final or row.get("sourceHeat") or section["heat"],
                "finalGroup": source_final or section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2018-specific parsing ────────────────────────────────────────────────────

FIELD_HEADERS_2018 = {
    "High Jump, Women - Final": ("High Jump", "W"),
    "Shot Put, Women - Final": ("Shot Put", "W"),
    "Pole Vault, Men - Final": ("Pole Vault", "M"),
    "Long Jump, Men - Final": ("Long Jump", "M"),
    "Shot Put, Men - Final": ("Shot Put", "M"),
    "Shot Put F42, Men - Final": ("Shot Put F42", "M"),
}

TRACK_HEADER_2018_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Women|Men)\s*-\s*"
    r"(?P<label>A-/?B-Final(?:e)?|Finale?|Heats?|Timed\s+heats?|Zeitl[aä]ufe)(?:\s*-\s*Continuation)?\s*$",
    re.IGNORECASE,
)

TRACK_DISC_2018_RE = re.compile(
    r"(?P<disc>60\s*m(?:\s+hurdles)?|400m|800m|1500m)\b",
    re.IGNORECASE,
)

COUNTRY_TOKEN_TO_NOC_2018 = {
    **COUNTRY_TOKEN_TO_NOC_2017,
    "NGR": "NGA",
}

NAME_FIXES_2018 = {
    **NAME_FIXES_2017,
    ("PRINSEN", "Donaid"): ("PRINSEN", "Donaid"),
    ("KIPLANGAT CHELANGAT", "Josp"): ("KIPLANGAT CHELANGAT", "Josp"),
}

HEAT_LINE_2018_RE = re.compile(r"^Heat\s+(?P<heat>\d+)\s+of\s+\d+(?:\s+Start\s+time:.*)?$", re.IGNORECASE)
FINAL_SUBLABEL_2018_RE = re.compile(r"^(?P<label>[AB]-Final)\s*$", re.IGNORECASE)
PLACEMENT_TOKEN_2018_RE = re.compile(r"^(?P<place>\d+)\./(?P<heat>[IVX]+)$", re.IGNORECASE)
ROMAN_FINAL_TO_NUMBER_2018 = {
    "I": "1",
    "II": "2",
    "III": "3",
}
FIELD_RECORD_DISCIPLINES_2018 = {"High Jump", "Pole Vault", "Shot Put", "Shot Put F42", "Long Jump"}


def preprocess_line_2018(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "National record Indoor": "National record Indoor",
        "Nouveau Record National F42 - Meeting Record F42": "Nouveau Record National F42 - Meeting Record F42",
        "New Meeting and Coque record": "New Meeting and Coque record",
        "CMCM Meeting record": "CMCM Meeting record",
        "KIPLANGAT CHELANGAT Jos1p993": "KIPLANGAT CHELANGAT Josp 1993",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_track_disc_2018(raw):
    text = preprocess_line_2018(raw)
    disc_match = TRACK_DISC_2018_RE.search(text)
    if not disc_match:
        return None
    discipline = normalize_disc_2009(disc_match.group("disc"))
    if "special olympics" in _strip_accents(text).lower():
        return f"{discipline} - Special Olympics"
    return discipline


def normalize_noc_2018(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2018.get(token) or COUNTRY_TOKEN_TO_NOC_2018.get(accentless) or token


def normalize_club_2018(team_tokens, noc):
    parts = [str(token or "").strip() for token in team_tokens if str(token or "").strip()]
    if not parts:
        return ""
    if len(parts) == 1 and normalize_noc_2018(parts[0]) == noc:
        return ""
    if all(normalize_noc_2018(part) == noc for part in parts if re.match(r"^[A-Z][A-Za-z.-]*$", part)):
        return ""
    club = " ".join(parts).strip()
    return "" if club.upper() == noc else club


def normalize_name_2018(last_name, first_name):
    return NAME_FIXES_2018.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2018(tokens):
    last_name, first_name = split_name_tokens_2014(tokens)
    return normalize_name_2018(last_name, first_name)


def infer_noc_and_club_2018(tokens_after_yob):
    parts = [str(token or "").strip() for token in tokens_after_yob if str(token or "").strip()]
    if not parts:
        return "", ""

    nat_token = parts[0]
    normalized_nat = normalize_noc_2018(nat_token)
    if len(parts) == 1:
        return normalized_nat, ""
    return normalized_nat, normalize_club_2018(parts[1:], normalized_nat)


def parse_field_header_2018(line):
    text = preprocess_line_2018(line)
    if "Continuation" in text:
        return None
    value = FIELD_HEADERS_2018.get(text)
    if not value:
        return None
    discipline, gender = value
    return {"discipline": discipline, "gender": gender}


def parse_track_header_2018(line):
    text = preprocess_line_2018(line)
    m = TRACK_HEADER_2018_RE.match(text)
    if not m:
        return None

    disc_raw = m.group("disc_raw").strip()
    gender = normalize_gender(m.group("gender"))
    label = (m.group("label") or "").strip()
    label_lower = _strip_accents(label).lower()

    discipline = normalize_track_disc_2018(disc_raw)
    if not discipline:
        return None

    if label_lower.startswith("a-/b-final"):
        if discipline == "400m":
            return {
                "discipline": discipline,
                "gender": gender,
                "round": "Final",
                "heat": "",
                "finalGroup": "",
                "linkedRound": "",
                "rawHeader": text,
                "_ab_parent": False,
                "_source_finals_1_2": True,
                "_active_heat": "",
            }
        return {
            "discipline": discipline,
            "gender": gender,
            "round": "Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
            "rawHeader": text,
            "_ab_parent": True,
            "_source_finals_1_2": False,
            "_active_heat": "",
        }

    round_value = "Final"
    heat = ""
    final_group = ""
    linked_round = ""

    if label_lower.startswith("heat"):
        round_value = "Heat"
        linked_round = "Final"
    elif label_lower.startswith("timed heat"):
        round_value = "Timed Final"
    elif label_lower.startswith("final") or label_lower.startswith("finale"):
        round_value = "Final"
    elif label_lower.startswith("zeitlaufe"):
        round_value = "Timed Final"
    else:
        return None

    return {
        "discipline": discipline,
        "gender": gender,
        "round": round_value,
        "heat": heat,
        "finalGroup": final_group,
        "linkedRound": linked_round,
        "rawHeader": text,
        "_ab_parent": False,
        "_source_finals_1_2": False,
        "_active_heat": "",
    }


def parse_track_result_line_2018(line, *, active_heat="", use_source_finals=False):
    text = preprocess_line_2018(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    source_heat = active_heat
    section_rank_override = None
    global_rank = None
    notes = ""
    preserve_missing_rank = False
    status_override = None

    if tokens[0].upper() == "OC":
        preserve_missing_rank = True
        notes = "Off competition"
        status_override = "OC"
        tokens = tokens[1:]

    placement_match = PLACEMENT_TOKEN_2018_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_FINAL_TO_NUMBER_2018.get(placement_match.group("heat").upper(), "")
        section_rank_override = int(placement_match.group("place"))
        tokens = tokens[:-1]

    qualification = ""
    if tokens and tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        global_rank = rank
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2018(context_tokens)
    last_name, first_name = split_name_tokens_2018(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result)
    if status_override:
        status = status_override
    section_rank = section_rank_override if use_source_finals and section_rank_override is not None else rank

    return {
        "sectionRank": None if preserve_missing_rank else section_rank,
        "globalRank": None if preserve_missing_rank else global_rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": notes,
        "sourceHeat": source_heat,
        "_preserveMissingRank": preserve_missing_rank,
    }


def parse_field_result_line_2018(line):
    text = preprocess_line_2018(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-2] if len(tokens) >= 2 and tokens[-1].lower() == "m" else tokens[-1]
    if len(tokens) >= 2 and tokens[-1].lower() == "m":
        raw_result = f"{raw_result} m"

    context_end = -2 if tokens[-1].lower() == "m" else -1
    context_tokens = tokens[yob_idx + 1:context_end]
    noc, club = infer_noc_and_club_2018(context_tokens)
    last_name, first_name = split_name_tokens_2018(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "globalRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
        "_preserveMissingRank": False,
    }


def standardize_note_2018(line, discipline=""):
    text = preprocess_line_2018(line)
    lower = _strip_accents(text).lower()

    if lower == "national record indoor":
        return "National Record Indoor"
    if lower == "meilleure performance nationale cadettes":
        return "National Best U18"
    if lower == "new meeting and coque record":
        return "Meeting Record"
    if lower == "cmcm meeting record":
        return "Meeting Record"
    if lower == "nouveau record national f42 - meeting record f42":
        return "National Record F42; Meeting Record F42"
    if lower == "rule 162.7":
        return "Rule 162.7"
    return None


def append_note_2018(row, note):
    if not row or not note:
        return
    existing = [part.strip() for part in str(row.get("notes") or "").split(";") if part.strip()]
    new_parts = [part.strip() for part in str(note).split(";") if part.strip()]
    for item in new_parts:
        if item not in existing:
            existing.append(item)
    row["notes"] = "; ".join(existing)


def dedupe_rows_2018(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
            row.get("notes", ""),
            row.get("globalRank"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2018(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    current_ab_parent = None

    for page_text in page_texts:
        for raw_line in page_text.splitlines():
            line = preprocess_line_2018(raw_line)
            if not line:
                continue

            note = standardize_note_2018(line, current["discipline"] if current else "")
            if note:
                if current and current.get("rows"):
                    append_note_2018(current["rows"][-1], note)
                continue

            heat_line_match = HEAT_LINE_2018_RE.match(line)
            if heat_line_match:
                if current and current.get("round") in {"Heat", "Timed Final"}:
                    current["_active_heat"] = heat_line_match.group("heat")
                continue

            final_sublabel_match = FINAL_SUBLABEL_2018_RE.match(line)
            if final_sublabel_match and current_ab_parent:
                label = final_sublabel_match.group("label").upper()
                group = "A" if label.startswith("A-") else "B"
                current = {
                    "discipline": current_ab_parent["discipline"],
                    "gender": current_ab_parent["gender"],
                    "round": "Final",
                    "heat": group,
                    "finalGroup": group,
                    "linkedRound": "",
                    "rawHeader": current_ab_parent["rawHeader"],
                    "rows": [],
                    "_active_heat": "",
                    "_source_finals_1_2": False,
                }
                sections.append(current)
                continue

            if (
                line.startswith("Printed on ")
                or line == "FLA Indoor - Meeting"
                or line.startswith("Results Coque, at ")
                or line.startswith("Date:")
                or line.startswith("Competitors:")
                or line.startswith("Rk. BIB ")
                or line.startswith("Rk. Name Name ")
                or line.startswith("Data service by ")
                or line.startswith("This list was created by ")
                or line == "Final"
                or line.startswith("Qualified are the ")
                or line.startswith("Hurdle's Height:")
                or re.match(r"^(?:-?T\d\s+){2,}-?T\d\s*$", line)
                or re.match(r"^\d+(?:,\d{2}|\.\d{2})?(?:\s+\d+(?:,\d{2}|\.\d{2})?)*$", line)
            ):
                continue

            field_header = parse_field_header_2018(line)
            if field_header:
                current_ab_parent = None
                current = {
                    "discipline": field_header["discipline"],
                    "gender": field_header["gender"],
                    "round": "Final",
                    "heat": "",
                    "finalGroup": "",
                    "linkedRound": "",
                    "rows": [],
                    "_active_heat": "",
                    "_source_finals_1_2": False,
                }
                sections.append(current)
                continue

            track_header = parse_track_header_2018(line)
            if track_header:
                if track_header["_ab_parent"]:
                    current_ab_parent = track_header
                    current = None
                else:
                    current_ab_parent = None
                    current = {k: v for k, v in track_header.items() if not k.startswith("_")}
                    current["rows"] = []
                    current["_active_heat"] = ""
                    current["_source_finals_1_2"] = track_header.get("_source_finals_1_2", False)
                    sections.append(current)
                continue

            if not current:
                continue

            if current["discipline"] in {"High Jump", "Pole Vault", "Shot Put", "Shot Put F42", "Long Jump"}:
                parsed = parse_field_result_line_2018(line)
            else:
                parsed = parse_track_result_line_2018(
                    line,
                    active_heat=current.get("_active_heat", ""),
                    use_source_finals=current.get("_source_finals_1_2", False),
                )

            if not parsed:
                continue

            if current.get("_source_finals_1_2") and parsed.get("sourceHeat"):
                current["_active_heat"] = parsed["sourceHeat"]
            if parsed["sectionRank"] is None and not parsed.get("_preserveMissingRank"):
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2018-02-03"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2018(section["rows"]):
            source_final = row.get("sourceHeat") if section.get("_source_finals_1_2") else ""
            results.append({
                "rank": row.get("globalRank") or row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": source_final or row.get("sourceHeat") or section["heat"],
                "finalGroup": source_final or section["finalGroup"],
                "linkedRound": linked_round,
                "notes": row["notes"],
            })

    return results


# ─── 2019-specific parsing ────────────────────────────────────────────────────

EVENT_HEADER_2019_RE = re.compile(
    r"^(?P<prefix>.+?)\s+\d{2}\.\d{2}\.\d{4}\s*/\s*\d{2}:\d{2}$",
    re.IGNORECASE,
)
EVENT_GENDER_2019_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Women|Men)(?:\s+\([^)]*\))?$",
    re.IGNORECASE,
)
EVENT_SKIP_2019_RE = re.compile(
    r"\b(U16M|U16W|4x50m|5x50m|ScM|ScF|DM|DF|BM|BF|LM|LF)\b",
    re.IGNORECASE,
)
PRELIM_HEAT_2019_RE = re.compile(
    r"^Preliminary Heat(?:\s+(?P<heat>\d+)(?:\s+of\s+\d+)?)?$",
    re.IGNORECASE,
)
A_B_FINAL_2019_RE = re.compile(r"^(?P<group>A|B)\s+Final(?:\s+of\s+\d+)?$", re.IGNORECASE)
TIMED_HEATS_2019_RE = re.compile(r"^Timed Heats?$", re.IGNORECASE)
FIELD_RECORD_DISCIPLINES_2019 = {"Long Jump", "Triple Jump", "Shot Put", "Shot Put F63"}

COUNTRY_TOKEN_TO_NOC_2019 = {
    **COUNTRY_TOKEN_TO_NOC_2018,
    "ALGERIEN": "ALG",
    "AUTRICHE": "AUT",
    "BELGIEN": "BEL",
    "DEUTSCHLAND": "DEU",
    "FRANCE": "FRA",
    "FRANKREICH": "FRA",
    "GROSSBRITANNIEN": "GBR",
    "GROßBRITANNIEN": "GBR",
    "GRIECHENLAND": "GRE",
    "ITALIEN": "ITA",
    "LETTLAND": "LAT",
    "LITAUEN": "LTU",
    "MAROKKO": "MAR",
    "NIEDERLANDE": "NED",
    "OESTERREICH": "AUT",
    "ÖSTERREICH": "AUT",
    "PORTUGAL": "POR",
    "REPUBLIK SUDAFRIKA": "RSA",
    "REPUBLIK SÜDAFRIKA": "RSA",
    "VEREINIGE ARABISCHE EMIRATE": "UAE",
}

NAME_FIXES_2019 = {
    **NAME_FIXES_2018,
}

ATHLETE_CONTEXT_FIXES_2019 = {
    ("BROSSIER", "Amandine"): ("FRA", ""),
}


def preprocess_line_2019(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "KODOVRA Katerina 1993 CZE Olymp Praha 8.80 5 168 VAN": "KODOVRA Katerina 1993 CZE Olymp Praha 8.80",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_noc_2019(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2019.get(token) or COUNTRY_TOKEN_TO_NOC_2019.get(accentless) or token


def normalize_club_2019(team_tokens, noc):
    parts = [str(token or "").strip() for token in team_tokens if str(token or "").strip()]
    if not parts:
        return ""
    club = " ".join(parts).strip()
    if not club:
        return ""
    if normalize_noc_2019(club) == noc:
        return ""
    if len(parts) == 1 and normalize_noc_2019(parts[0]) == noc:
        return ""
    if all(normalize_noc_2019(part) == noc for part in parts if re.match(r"^[A-Za-zÀ-ÿ.-]+$", part)):
        return ""
    return "" if club.upper() == noc else club


def normalize_name_2019(last_name, first_name):
    return NAME_FIXES_2019.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2019(tokens):
    last_name, first_name = split_name_tokens_2014(tokens)
    return normalize_name_2019(last_name, first_name)


def infer_noc_and_club_2019(tokens_after_yob):
    parts = [str(token or "").strip() for token in tokens_after_yob if str(token or "").strip()]
    if not parts:
        return "", ""

    nat_token = parts[0]
    normalized_nat = normalize_noc_2019(nat_token)
    if len(parts) == 1:
        return normalized_nat, ""
    return normalized_nat, normalize_club_2019(parts[1:], normalized_nat)


def normalize_athlete_context_2019(last_name, first_name, noc, club):
    return ATHLETE_CONTEXT_FIXES_2019.get((last_name, first_name), (noc, club))


def normalize_event_disc_2019(raw):
    text = preprocess_line_2019(raw)
    lower = _strip_accents(text).lower()

    if lower.startswith("shot put f-63"):
        return "Shot Put F63"
    if "special olympics" in lower:
        base = re.match(r"^(?P<disc>\d+\s*m)", lower)
        if base:
            return f"{normalize_disc_2009(base.group('disc'))} - Special Olympics"
    if re.search(r"60\s*m\s*hurdles?", lower):
        return "60m Hurdles"
    if re.search(r"\b50\s*m\b", lower):
        return "50m"
    if re.search(r"\b60\s*m\b", lower):
        return "60m"
    if re.search(r"\b400\s*m\b", lower):
        return "400m"
    if re.search(r"\b800\s*m\b", lower):
        return "800m"
    if re.search(r"\b1500\s*m\b|\b1\s*500\s*m\b", lower):
        return "1500m"
    if lower.startswith("long jump"):
        return "Long Jump"
    if lower.startswith("triple jump"):
        return "Triple Jump"
    if lower.startswith("shot put"):
        return "Shot Put"
    return None


def parse_event_header_2019(line):
    text = preprocess_line_2019(line)
    m = EVENT_HEADER_2019_RE.match(text)
    if not m:
        return None

    prefix = m.group("prefix").strip()
    continuation = prefix.endswith(" - Continuation")
    if continuation:
        prefix = prefix[: -len(" - Continuation")].strip()

    if EVENT_SKIP_2019_RE.search(prefix):
        return "skip"

    m2 = EVENT_GENDER_2019_RE.match(prefix)
    if not m2:
        return None

    discipline = normalize_event_disc_2019(m2.group("disc_raw"))
    gender = normalize_gender(m2.group("gender"))
    if not discipline or not gender:
        return None

    return {
        "discipline": discipline,
        "gender": gender,
        "kind": "field" if discipline in FIELD_RECORD_DISCIPLINES_2019 else "track",
        "continuation": continuation,
        "eventNotes": "Off Silver" if discipline == "50m" else "",
    }


def parse_round_2019(line):
    text = preprocess_line_2019(line)

    m = PRELIM_HEAT_2019_RE.match(text)
    if m:
        return {
            "round": "Heat",
            "heat": m.group("heat") or "",
            "finalGroup": "",
            "linkedRound": "Final",
        }

    m = A_B_FINAL_2019_RE.match(text)
    if m:
        group = m.group("group").upper()
        return {
            "round": "Final",
            "heat": group,
            "finalGroup": group,
            "linkedRound": "",
        }

    if TIMED_HEATS_2019_RE.match(text):
        return {
            "round": "Timed Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
        }

    if text == "Final":
        return {
            "round": "Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
        }

    return None


def parse_track_result_line_2019(line):
    text = preprocess_line_2019(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    qualification = ""
    if tokens and tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    global_rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        global_rank = rank
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2019(context_tokens)
    last_name, first_name = split_name_tokens_2019(name_tokens)
    if not last_name:
        return None
    noc, club = normalize_athlete_context_2019(last_name, first_name, noc, club)

    result, status = normalize_perf_2014(raw_result)

    return {
        "sectionRank": rank,
        "globalRank": global_rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": "",
    }


def parse_field_result_line_2019(line):
    text = preprocess_line_2019(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-2] if len(tokens) >= 2 and tokens[-1].lower() == "m" else tokens[-1]
    if len(tokens) >= 2 and tokens[-1].lower() == "m":
        raw_result = f"{raw_result} m"

    context_end = -2 if tokens[-1].lower() == "m" else -1
    context_tokens = tokens[yob_idx + 1:context_end]
    noc, club = infer_noc_and_club_2019(context_tokens)
    last_name, first_name = split_name_tokens_2019(name_tokens)
    if not last_name:
        return None
    noc, club = normalize_athlete_context_2019(last_name, first_name, noc, club)

    result, status = normalize_perf_2014(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "globalRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
    }


def standardize_note_2019(line):
    text = preprocess_line_2019(line)
    lower = _strip_accents(text).lower()

    if lower == "rule 162.7":
        return "Rule 162.7"
    if lower == "record national senior, meilleure performance nationale espoir":
        return "National Record; National Best U23"
    if lower == "meilleure performance nationale junior/cadette":
        return "National Best U20; National Best U18"
    if lower == "meilleure performance nationale espoir/junior":
        return "National Best U23; National Best U20"
    if lower == "meilleure performance nationale indoor cadettes":
        return "National Best Indoor U18"
    if lower == "record national indoor":
        return "National Record Indoor"
    if lower == "new national record lpc":
        return "National Record LPC"
    return None


def append_note_2019(row, note):
    if not row or not note:
        return
    existing = [part.strip() for part in str(row.get("notes") or "").split(";") if part.strip()]
    new_parts = [part.strip() for part in str(note).split(";") if part.strip()]
    for item in new_parts:
        if item not in existing:
            existing.append(item)
    row["notes"] = "; ".join(existing)


def dedupe_rows_2019(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("notes", ""),
            row.get("globalRank"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2019(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    pending_event = None

    def find_existing_section(discipline, gender, round_value, heat="", final_group=""):
        for section in reversed(sections):
            if (
                section.get("discipline") == discipline
                and section.get("gender") == gender
                and section.get("round") == round_value
                and section.get("heat") == heat
                and section.get("finalGroup") == final_group
            ):
                return section
        return None

    for page_text in page_texts:
        for raw_line in page_text.splitlines():
            line = preprocess_line_2019(raw_line)
            if not line:
                continue

            note = standardize_note_2019(line)
            if note:
                if current and current.get("rows"):
                    append_note_2019(current["rows"][-1], note)
                continue

            if (
                line.startswith("17. CMCM Indoor Meeting")
                or "Track and Field 3.1.0.2744" in line
                or line.startswith("Luxembourg-Kirchberg, Coque, ")
                or line == "RESULTS"
                or line == "Dataservice by"
                or line.startswith("Internet-Service:")
                or line.startswith("Printed at ")
                or line.startswith("Rank Bib Name YoB NPC Club Result")
                or line.startswith("Rank Name NPC Club Result")
                or line.startswith("First ")
                or line.startswith("- T1 ")
                or re.match(r"^[xX\-](?:\s+[xX\-]|\s+\d+(?:\.\d+)?)+$", line)
                or re.match(r"^\d+\.\d{3}$", line)
            ):
                continue

            event_header = parse_event_header_2019(line)
            if event_header == "skip":
                pending_event = None
                current = None
                continue
            if event_header:
                pending_event = event_header
                current = None
                if event_header["kind"] == "field":
                    existing = None
                    if event_header["continuation"]:
                        existing = find_existing_section(
                            event_header["discipline"],
                            event_header["gender"],
                            "Final",
                        )
                    current = existing or {
                        "discipline": event_header["discipline"],
                        "gender": event_header["gender"],
                        "round": "Final",
                        "heat": "",
                        "finalGroup": "",
                        "linkedRound": "",
                        "rows": [],
                        "_eventNotes": event_header["eventNotes"],
                    }
                    if not existing:
                        sections.append(current)
                    pending_event = None
                continue

            round_info = parse_round_2019(line)
            if round_info and pending_event and pending_event["kind"] == "track":
                existing = None
                if pending_event["continuation"]:
                    existing = find_existing_section(
                        pending_event["discipline"],
                        pending_event["gender"],
                        round_info["round"],
                        round_info["heat"],
                        round_info["finalGroup"],
                    )
                current = existing or {
                    "discipline": pending_event["discipline"],
                    "gender": pending_event["gender"],
                    "round": round_info["round"],
                    "heat": round_info["heat"],
                    "finalGroup": round_info["finalGroup"],
                    "linkedRound": round_info["linkedRound"],
                    "rows": [],
                    "_eventNotes": pending_event["eventNotes"],
                }
                if not existing:
                    sections.append(current)
                pending_event = None
                continue

            if not current:
                continue

            if current["discipline"] in FIELD_RECORD_DISCIPLINES_2019:
                parsed = parse_field_result_line_2019(line)
            else:
                parsed = parse_track_result_line_2019(line)

            if not parsed:
                continue

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2019-02-02"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2019(section["rows"]):
            notes = row["notes"]
            if section.get("_eventNotes"):
                append_note_2019(row, section["_eventNotes"])
                notes = row["notes"]
            results.append({
                "rank": row.get("globalRank") or row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": notes,
            })

    return results


# ─── 2020-specific parsing ────────────────────────────────────────────────────

TRACK_EVENT_HEADER_2020_RE = re.compile(
    r"^(?P<prefix>.+?)\s+\d{2}\.\d{2}\.\d{4}\s*/\s*\d{2}:\d{2}$",
    re.IGNORECASE,
)
FIELD_EVENT_HEADER_2020_RE = re.compile(
    r"^(?P<prefix>(?:Pole Vault|High Jump|Triple Jump|Shut Put|Shot Put),\s*(?:Women|Men)(?:\s+\([^)]*\))?)$",
    re.IGNORECASE,
)
EVENT_GENDER_2020_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*(?P<gender>Women|Men)(?:\s+\([^)]*\))?$",
    re.IGNORECASE,
)
EVENT_SKIP_2020_RE = re.compile(
    r"\b(Ludiques?|Benjamins?|Débutants?|Scolaires?|Minimes|4x50m|5x50m|4x200m)\b",
    re.IGNORECASE,
)
VORLAUF_2020_RE = re.compile(
    r"^Vorlauf(?:\s+(?P<heat>\d+)(?:\s+of\s+\d+)?)?$",
    re.IGNORECASE,
)
A_B_FINALE_2020_RE = re.compile(r"^(?P<group>A|B)\s+Finale$", re.IGNORECASE)
TIMED_HEATS_2020_RE = re.compile(r"^Timed Heats?$", re.IGNORECASE)
PLACEMENT_TOKEN_2020_RE = re.compile(r"^(?P<place>\d+|-)\.?/(?P<heat>[IVX]+)$", re.IGNORECASE)
ROMAN_HEAT_TO_NUMBER_2020 = {
    "I": "1",
    "II": "2",
    "III": "3",
}
FIELD_RECORD_DISCIPLINES_2020 = {"Pole Vault", "High Jump", "Triple Jump", "Shot Put"}

COUNTRY_TOKEN_TO_NOC_2020 = {
    **COUNTRY_TOKEN_TO_NOC_2019,
    "ALGERIA": "ALG",
    "BELGIUM": "BEL",
    "BOSNIA-HERZEGOWINA": "BIH",
    "BRAZIL": "BRA",
    "BRAZILIA": "BRA",
    "GREECE": "GRE",
    "JAMAICA": "JAM",
    "KENYA": "KEN",
    "MOROCCO": "MAR",
    "NEW ZEALAND": "NZL",
    "POLAND": "POL",
    "QATAR": "QAT",
    "ROMANIA": "ROU",
    "SPAIN": "ESP",
    "TOGO": "TOG",
}

NAME_FIXES_2020 = {
    **NAME_FIXES_2019,
}


def preprocess_line_2020(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""

    replacements = {
        "Shut Put, Men (7.26kg)": "Shot Put, Men (7.26kg)",
        "Shut Put, Men": "Shot Put, Men",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)

    text = re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)
    return text


def normalize_noc_2020(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2020.get(token) or COUNTRY_TOKEN_TO_NOC_2020.get(accentless) or token


def normalize_club_2020(team_tokens, noc):
    parts = [str(token or "").strip() for token in team_tokens if str(token or "").strip()]
    if not parts:
        return ""
    club = " ".join(parts).strip()
    if not club:
        return ""
    if normalize_noc_2020(club) == noc:
        return ""
    if len(parts) == 1 and normalize_noc_2020(parts[0]) == noc:
        return ""
    if all(normalize_noc_2020(part) == noc for part in parts if re.match(r"^[A-Za-zÀ-ÿ.'/-]+$", part)):
        return ""
    return "" if club.upper() == noc else club


def normalize_name_2020(last_name, first_name):
    return NAME_FIXES_2020.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2020(tokens):
    last_name, first_name = split_name_tokens_2014(tokens)
    return normalize_name_2020(last_name, first_name)


def infer_noc_and_club_2020(tokens_after_yob):
    parts = [str(token or "").strip() for token in tokens_after_yob if str(token or "").strip()]
    if not parts:
        return "", ""

    nat_token = parts[0]
    normalized_nat = normalize_noc_2020(nat_token)
    if len(parts) == 1:
        return normalized_nat, ""
    return normalized_nat, normalize_club_2020(parts[1:], normalized_nat)


def normalize_event_disc_2020(raw):
    text = preprocess_line_2020(raw)
    lower = _strip_accents(text).lower()

    if lower.startswith("800m, special olympique"):
        return "800m - Special Olympics"
    if re.search(r"60\s*m\s*hurdles?", lower):
        return "60m Hurdles"
    if re.search(r"\b50\s*m\b", lower):
        return "50m"
    if re.search(r"\b60\s*m\b", lower):
        return "60m"
    if re.search(r"\b400\s*m\b", lower):
        return "400m"
    if re.search(r"\b800\s*m\b", lower):
        return "800m"
    if re.search(r"\b1500\s*m\b|\b1\s*500\s*m\b", lower):
        return "1500m"
    if lower.startswith("pole vault"):
        return "Pole Vault"
    if lower.startswith("high jump"):
        return "High Jump"
    if lower.startswith("triple jump"):
        return "Triple Jump"
    if lower.startswith("shot put"):
        return "Shot Put"
    return None


def parse_event_header_2020(line):
    text = preprocess_line_2020(line)

    m = TRACK_EVENT_HEADER_2020_RE.match(text)
    if m:
        prefix = m.group("prefix").strip()
        continuation = prefix.endswith(" - Continuation")
        if continuation:
            prefix = prefix[: -len(" - Continuation")].strip()

        if EVENT_SKIP_2020_RE.search(prefix):
            return "skip"

        if _strip_accents(prefix).lower().startswith("800m, special olympique"):
            return {
                "discipline": "800m - Special Olympics",
                "gender": "M",
                "kind": "track",
                "continuation": continuation,
                "eventNotes": "",
            }

        gender_match = EVENT_GENDER_2020_RE.match(prefix)
        if not gender_match:
            return None
        discipline = normalize_event_disc_2020(gender_match.group("disc_raw"))
        gender = normalize_gender(gender_match.group("gender"))
        if not discipline or not gender:
            return None
        return {
            "discipline": discipline,
            "gender": gender,
            "kind": "field" if discipline in FIELD_RECORD_DISCIPLINES_2020 else "track",
            "continuation": continuation,
            "eventNotes": "Off Silver" if discipline == "50m" else "",
        }

    m = FIELD_EVENT_HEADER_2020_RE.match(text)
    if m:
        prefix = m.group("prefix").strip()
        gender_match = EVENT_GENDER_2020_RE.match(prefix)
        if not gender_match:
            return None
        discipline = normalize_event_disc_2020(gender_match.group("disc_raw"))
        gender = normalize_gender(gender_match.group("gender"))
        if not discipline or not gender:
            return None
        return {
            "discipline": discipline,
            "gender": gender,
            "kind": "field",
            "continuation": False,
            "eventNotes": "",
        }

    return None


def parse_round_2020(line):
    text = preprocess_line_2020(line)
    text = re.sub(r"\s+\d{2}\.\d{2}\.\d{4}\s*/\s*\d{2}:\d{2}$", "", text).strip()

    m = VORLAUF_2020_RE.match(text)
    if m:
        return {
            "round": "Heat",
            "heat": m.group("heat") or "",
            "finalGroup": "",
            "linkedRound": "Final",
            "_source_heats": False,
        }

    m = A_B_FINALE_2020_RE.match(text)
    if m:
        group = m.group("group").upper()
        return {
            "round": "Final",
            "heat": group,
            "finalGroup": group,
            "linkedRound": "",
            "_source_heats": False,
        }

    if TIMED_HEATS_2020_RE.match(text):
        return {
            "round": "Timed Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
            "_source_heats": True,
        }

    if text.startswith("Final"):
        return {
            "round": "Final",
            "heat": "",
            "finalGroup": "",
            "linkedRound": "",
            "_source_heats": False,
        }

    return None


def parse_track_result_line_2020(line, *, use_source_heats=False):
    text = preprocess_line_2020(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    source_heat = ""
    section_rank_override = None
    global_rank = None
    preserve_missing_rank = False

    placement_match = PLACEMENT_TOKEN_2020_RE.match(tokens[-1])
    if placement_match:
        source_heat = ROMAN_HEAT_TO_NUMBER_2020.get(placement_match.group("heat").upper(), "")
        if placement_match.group("place").isdigit():
            section_rank_override = int(placement_match.group("place"))
        else:
            preserve_missing_rank = True
        tokens = tokens[:-1]

    qualification = ""
    if tokens and tokens[-1] in {"Q", "q"}:
        qualification = tokens[-1]
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        global_rank = rank
        start_index = 1
    elif tokens and tokens[0].isdigit():
        preserve_missing_rank = True
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2020(context_tokens)
    last_name, first_name = split_name_tokens_2020(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result)
    section_rank = section_rank_override if use_source_heats and section_rank_override is not None else rank

    return {
        "sectionRank": None if preserve_missing_rank and section_rank is None else section_rank,
        "globalRank": global_rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": "",
        "sourceHeat": source_heat,
        "_preserveMissingRank": preserve_missing_rank,
    }


def parse_field_result_line_2020(line):
    text = preprocess_line_2020(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-2] if len(tokens) >= 2 and tokens[-1].lower() == "m" else tokens[-1]
    if len(tokens) >= 2 and tokens[-1].lower() == "m":
        raw_result = f"{raw_result} m"

    context_end = -2 if tokens[-1].lower() == "m" else -1
    context_tokens = tokens[yob_idx + 1:context_end]
    noc, club = infer_noc_and_club_2020(context_tokens)
    last_name, first_name = split_name_tokens_2020(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "globalRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
        "sourceHeat": "",
        "_preserveMissingRank": False,
    }


def standardize_note_2020(line):
    text = preprocess_line_2020(line)
    lower = _strip_accents(text).lower()

    if lower == "nouveau record cmcm et coque":
        return "Meeting Record"
    if lower == "meilleur perf. nat. cadettes et juniors":
        return "National Best U18; National Best U20"
    if lower == "rule 163.3b":
        return "Rule 163.3b"
    return None


def append_note_2020(row, note):
    return append_note_2019(row, note)


def dedupe_rows_2020(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("sourceHeat", ""),
            row.get("notes", ""),
            row.get("globalRank"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2020(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    pending_event = None

    def find_existing_section(discipline, gender, round_value, heat="", final_group=""):
        for section in reversed(sections):
            if (
                section.get("discipline") == discipline
                and section.get("gender") == gender
                and section.get("round") == round_value
                and section.get("heat") == heat
                and section.get("finalGroup") == final_group
            ):
                return section
        return None

    for page_text in page_texts:
        for raw_line in page_text.splitlines():
            line = preprocess_line_2020(raw_line)
            if not line:
                continue

            note = standardize_note_2020(line)
            if note:
                if current and current.get("rows"):
                    append_note_2020(current["rows"][-1], note)
                continue

            if (
                line == "CMCM Indoor Meeting 2020 RESULTS"
                or line.startswith("Luxembourg, Coque, ")
                or line.startswith("Dataservice by Internet-Service:")
                or line.startswith("Printed at ")
                or line.startswith("Rank Bib Name YoB NOC Club Result")
                or line.startswith("Rank Name NOC Club Result")
                or line.startswith("First ")
                or line.startswith("- T1 ")
                or re.match(r"^[xX\-](?:\s+[xX\-]|\s+\d+(?:\.\d+)?)+$", line)
            ):
                continue

            event_header = parse_event_header_2020(line)
            if event_header == "skip":
                pending_event = None
                current = None
                continue
            if event_header:
                pending_event = event_header
                current = None
                if event_header["kind"] == "field":
                    existing = None
                    if event_header["continuation"]:
                        existing = find_existing_section(
                            event_header["discipline"],
                            event_header["gender"],
                            "Final",
                        )
                    current = existing or {
                        "discipline": event_header["discipline"],
                        "gender": event_header["gender"],
                        "round": "Final",
                        "heat": "",
                        "finalGroup": "",
                        "linkedRound": "",
                        "rows": [],
                        "_eventNotes": event_header["eventNotes"],
                        "_source_heats": False,
                    }
                    if not existing:
                        sections.append(current)
                    pending_event = None
                continue

            round_info = parse_round_2020(line)
            if round_info and pending_event and pending_event["kind"] == "track":
                existing = None
                if pending_event["continuation"]:
                    existing = find_existing_section(
                        pending_event["discipline"],
                        pending_event["gender"],
                        round_info["round"],
                        round_info["heat"],
                        round_info["finalGroup"],
                    )
                current = existing or {
                    "discipline": pending_event["discipline"],
                    "gender": pending_event["gender"],
                    "round": round_info["round"],
                    "heat": round_info["heat"],
                    "finalGroup": round_info["finalGroup"],
                    "linkedRound": round_info["linkedRound"],
                    "rows": [],
                    "_eventNotes": pending_event["eventNotes"],
                    "_source_heats": round_info.get("_source_heats", False),
                }
                if not existing:
                    sections.append(current)
                pending_event = None
                continue

            if not current:
                continue

            if current["discipline"] in FIELD_RECORD_DISCIPLINES_2020:
                parsed = parse_field_result_line_2020(line)
            else:
                parsed = parse_track_result_line_2020(
                    line,
                    use_source_heats=current.get("_source_heats", False),
                )

            if not parsed:
                continue

            if parsed["sectionRank"] is None and not parsed.get("_preserveMissingRank"):
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2020-02-01"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2020(section["rows"]):
            notes = row["notes"]
            if section.get("_eventNotes"):
                append_note_2020(row, section["_eventNotes"])
                notes = row["notes"]

            source_heat = row.get("sourceHeat") if section.get("_source_heats") else ""
            results.append({
                "rank": row.get("globalRank") or row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": source_heat or section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": notes,
            })

    return results


# ─── 2021-specific parsing ────────────────────────────────────────────────────

TRACK_EVENT_HEADER_2021_RE = re.compile(
    r"^(?P<prefix>.+?)\s+\d{2}\.\d{2}\.\d{4}\s*/\s*\d{2}:\d{2}$",
    re.IGNORECASE,
)
FIELD_EVENT_HEADER_2021_RE = re.compile(
    r"^(?P<prefix>(?:Shot Put|High Jump|Long Jump),\s*Seniors?\s+(?:fem\.|masc\.)(?:\s+\([^)]*\))?)$",
    re.IGNORECASE,
)
EVENT_GENDER_2021_RE = re.compile(
    r"^(?P<disc_raw>.+?),\s*Seniors?\s+(?P<gender>fem\.|masc\.)(?:\s+\([^)]*\))?$",
    re.IGNORECASE,
)
VORLAUF_2021_RE = re.compile(r"^Vorlauf$", re.IGNORECASE)
TIMED_HEATS_2021_RE = re.compile(r"^Timed Heats?$", re.IGNORECASE)
FIELD_RECORD_DISCIPLINES_2021 = {"Shot Put", "High Jump", "Long Jump"}

COUNTRY_TOKEN_TO_NOC_2021 = {
    **COUNTRY_TOKEN_TO_NOC_2020,
    "AUSTRIA": "AUT",
    "AUSTRALIA": "AUS",
    "BENIN": "BEN",
    "FRANCE": "FRA",
    "GERMANY": "DEU",
    "GREAT-BRITAIN": "GBR",
    "ITALY": "ITA",
    "LUXEMBOURG": "LUX",
    "MEXICO": "MEX",
    "NETHERLANDS": "NED",
    "NORWAY": "NOR",
    "PUERTO RICO": "PUR",
    "SWEDEN": "SWE",
}

NAME_FIXES_2021 = {
    **NAME_FIXES_2020,
    ("KIPLANGAT", "Josephine"): ("KIPLANGAT CHELANGAT", "Josephine"),
}


def preprocess_line_2021(line):
    text = re.sub(r"\s+", " ", str(line or "").strip())
    if not text:
        return ""
    return re.sub(r"([A-Za-zÀ-ÿ])((?:19|20)\d{2})\b", r"\1 \2", text)


def normalize_noc_2021(raw_token):
    token = str(raw_token or "").strip().upper()
    accentless = _strip_accents(token)
    return COUNTRY_TOKEN_TO_NOC_2021.get(token) or COUNTRY_TOKEN_TO_NOC_2021.get(accentless) or token


def normalize_club_2021(team_tokens, noc):
    parts = [str(token or "").strip() for token in team_tokens if str(token or "").strip()]
    if not parts:
        return ""
    club = " ".join(parts).strip()
    if not club:
        return ""
    if normalize_noc_2021(club) == noc:
        return ""
    if len(parts) == 1 and normalize_noc_2021(parts[0]) == noc:
        return ""
    if all(normalize_noc_2021(part) == noc for part in parts if re.match(r"^[A-Za-zÀ-ÿ.'/-]+$", part)):
        return ""
    return "" if club.upper() == noc else club


def normalize_name_2021(last_name, first_name):
    return NAME_FIXES_2021.get((last_name, first_name), (last_name, first_name))


def split_name_tokens_2021(tokens):
    last_name, first_name = split_name_tokens_2014(tokens)
    return normalize_name_2021(last_name, first_name)


def infer_noc_and_club_2021(tokens_after_yob):
    parts = [str(token or "").strip() for token in tokens_after_yob if str(token or "").strip()]
    if not parts:
        return "", ""

    nat_token = parts[0]
    normalized_nat = normalize_noc_2021(nat_token)
    if len(parts) == 1:
        return normalized_nat, ""
    return normalized_nat, normalize_club_2021(parts[1:], normalized_nat)


def normalize_gender_2021(raw):
    token = _strip_accents(str(raw or "").strip().lower())
    if token == "fem.":
        return "W"
    if token == "masc.":
        return "M"
    return None


def normalize_event_disc_2021(raw):
    text = preprocess_line_2021(raw)
    lower = _strip_accents(text).lower()

    if re.search(r"60\s*m\s*hurdles?", lower):
        return "60m Hurdles"
    if re.search(r"\b50\s*m\b", lower):
        return "50m"
    if re.search(r"\b60\s*m\b", lower):
        return "60m"
    if re.search(r"\b800\s*m\b", lower):
        return "800m"
    if re.search(r"\b1500\s*m\b|\b1\s*500\s*m\b", lower):
        return "1500m"
    if lower.startswith("shot put"):
        return "Shot Put"
    if lower.startswith("high jump"):
        return "High Jump"
    if lower.startswith("long jump"):
        return "Long Jump"
    return None


def parse_event_header_2021(line):
    text = preprocess_line_2021(line)

    m = TRACK_EVENT_HEADER_2021_RE.match(text)
    if m:
        prefix = m.group("prefix").strip()
        gender_match = EVENT_GENDER_2021_RE.match(prefix)
        if not gender_match:
            return None
        discipline = normalize_event_disc_2021(gender_match.group("disc_raw"))
        gender = normalize_gender_2021(gender_match.group("gender"))
        if not discipline or not gender:
            return None
        return {
            "discipline": discipline,
            "gender": gender,
            "kind": "field" if discipline in FIELD_RECORD_DISCIPLINES_2021 else "track",
            "eventNotes": "Off Silver" if discipline == "50m" else "",
        }

    m = FIELD_EVENT_HEADER_2021_RE.match(text)
    if m:
        prefix = m.group("prefix").strip()
        gender_match = EVENT_GENDER_2021_RE.match(prefix)
        if not gender_match:
            return None
        discipline = normalize_event_disc_2021(gender_match.group("disc_raw"))
        gender = normalize_gender_2021(gender_match.group("gender"))
        if not discipline or not gender:
            return None
        return {
            "discipline": discipline,
            "gender": gender,
            "kind": "field",
            "eventNotes": "",
        }

    return None


def parse_round_2021(line):
    text = preprocess_line_2021(line)
    text = re.sub(r"\s+\d{2}\.\d{2}\.\d{4}\s*/\s*\d{2}:\d{2}$", "", text).strip()

    if VORLAUF_2021_RE.match(text):
        return {"round": "Heat", "heat": "1", "finalGroup": "", "linkedRound": "Final"}
    if TIMED_HEATS_2021_RE.match(text):
        return {"round": "Timed Final", "heat": "", "finalGroup": "", "linkedRound": ""}
    if text.startswith("Final"):
        return {"round": "Final", "heat": "", "finalGroup": "", "linkedRound": ""}
    return None


def parse_track_result_line_2021(line):
    text = preprocess_line_2021(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    qualification = ""
    while tokens:
        last = tokens[-1]
        if last in {"q", "Q"}:
            qualification = last
            tokens = tokens[:-1]
            continue
        if last in {"PB", "SB", "=PB", "=SB"}:
            tokens = tokens[:-1]
            continue
        break

    rank = None
    global_rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        global_rank = rank
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2021(context_tokens)
    last_name, first_name = split_name_tokens_2021(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result)

    return {
        "sectionRank": rank,
        "globalRank": global_rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": qualification,
        "notes": "",
    }


def parse_field_result_line_2021(line):
    text = preprocess_line_2021(line)
    tokens = text.split()
    if len(tokens) < 4:
        return None

    while tokens and re.match(r"^=?[A-Z]{1,3}$", tokens[-1]) and tokens[-1] in {"PB", "SB", "=PB", "=SB"}:
        tokens = tokens[:-1]

    rank = None
    start_index = 0
    if len(tokens) > 1 and tokens[0].isdigit() and tokens[1].isdigit():
        rank = int(tokens[0])
        start_index = 1
    elif tokens and tokens[0].isdigit():
        start_index = 0
    else:
        return None

    if len(tokens[start_index:]) < 4:
        return None

    bib_token = tokens[start_index]

    yob_idx = None
    for i in range(start_index + 1, len(tokens)):
        if YOB_RE.match(tokens[i]):
            yob_idx = i
            break

    if yob_idx is None or yob_idx + 1 >= len(tokens):
        return None

    name_tokens = tokens[start_index + 1:yob_idx]
    if not name_tokens:
        return None

    raw_result = tokens[-1]
    context_tokens = tokens[yob_idx + 1:-1]
    noc, club = infer_noc_and_club_2021(context_tokens)
    last_name, first_name = split_name_tokens_2021(name_tokens)
    if not last_name:
        return None

    result, status = normalize_perf_2014(raw_result, field_event=True)

    return {
        "sectionRank": rank,
        "globalRank": rank,
        "lastName": last_name,
        "firstName": first_name,
        "noc": noc,
        "club": club,
        "bib": bib_token,
        "result": result,
        "rawResult": raw_result,
        "status": status,
        "qualification": "",
        "notes": "",
    }


def standardize_note_2021(line):
    text = preprocess_line_2021(line)
    lower = _strip_accents(text).lower()

    if lower == "meeting record":
        return "Meeting Record"
    return None


def append_note_2021(row, note):
    return append_note_2019(row, note)


def dedupe_rows_2021(rows):
    seen = set()
    unique = []
    for row in rows:
        key = (
            row["lastName"],
            row["firstName"],
            row["noc"],
            row.get("club", ""),
            row["rawResult"],
            row["status"],
            row.get("qualification", ""),
            row.get("notes", ""),
            row.get("globalRank"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def build_year_results_2021(year, pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]

    sections = []
    current = None
    pending_event = None

    for page_text in page_texts:
        for raw_line in page_text.splitlines():
            line = preprocess_line_2021(raw_line)
            if not line:
                continue

            note = standardize_note_2021(line)
            if note:
                if current and current.get("rows"):
                    append_note_2021(current["rows"][-1], note)
                continue

            if (
                line == "CMCM Indoor Meeting RESULTS"
                or line.startswith("Luxembourg, Coque, ")
                or line.startswith("Dataservice by Internet-Service:")
                or line.startswith("Printed at ")
                or line.startswith("Rank Bib Name YoB NOC Club Result")
                or line.startswith("8 fastest")
                or line.startswith("- T1 ")
                or line == "Chelangat"
                or re.match(r"^[xX\-](?:\s+[xX\-]|\s+\d+(?:,\d+)?)+$", line)
            ):
                continue

            event_header = parse_event_header_2021(line)
            if event_header:
                pending_event = event_header
                current = None
                if event_header["kind"] == "field":
                    current = {
                        "discipline": event_header["discipline"],
                        "gender": event_header["gender"],
                        "round": "Final",
                        "heat": "",
                        "finalGroup": "",
                        "linkedRound": "",
                        "rows": [],
                        "_eventNotes": event_header["eventNotes"],
                    }
                    sections.append(current)
                    pending_event = None
                continue

            round_info = parse_round_2021(line)
            if round_info and pending_event and pending_event["kind"] == "track":
                current = {
                    "discipline": pending_event["discipline"],
                    "gender": pending_event["gender"],
                    "round": round_info["round"],
                    "heat": round_info["heat"],
                    "finalGroup": round_info["finalGroup"],
                    "linkedRound": round_info["linkedRound"],
                    "rows": [],
                    "_eventNotes": pending_event["eventNotes"],
                }
                sections.append(current)
                pending_event = None
                continue

            if not current:
                continue

            if current["discipline"] in FIELD_RECORD_DISCIPLINES_2021:
                parsed = parse_field_result_line_2021(line)
            else:
                parsed = parse_track_result_line_2021(line)

            if not parsed:
                continue

            if parsed["sectionRank"] is None:
                parsed["sectionRank"] = len(current["rows"]) + 1
            current["rows"].append(parsed)

    edition_date = "2021-02-13"
    results = []
    has_heat_rounds = {
        (section["discipline"], section["gender"])
        for section in sections
        if section["round"] == "Heat"
    }

    for section in sections:
        if not section["rows"]:
            continue

        linked_round = section["linkedRound"]
        if not linked_round and section["round"] in {"Final", "Timed Final"} and (section["discipline"], section["gender"]) in has_heat_rounds:
            linked_round = "Heat"

        for row in dedupe_rows_2021(section["rows"]):
            notes = row["notes"]
            if section.get("_eventNotes"):
                append_note_2021(row, section["_eventNotes"])
                notes = row["notes"]
            results.append({
                "rank": row.get("globalRank") or row["sectionRank"],
                "sectionRank": row["sectionRank"],
                "lastName": row["lastName"],
                "firstName": row["firstName"],
                "noc": row["noc"],
                "club": row["club"],
                "result": row["result"],
                "rawResult": row["rawResult"],
                "status": row["status"],
                "qualification": row["qualification"],
                "discipline": section["discipline"],
                "gender": section["gender"],
                "year": year,
                "date": edition_date,
                "round": section["round"],
                "heat": section["heat"],
                "finalGroup": section["finalGroup"],
                "linkedRound": linked_round,
                "notes": notes,
            })

    return results


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
    if year == 2003:
        return build_year_results_2003(year, pdf_path)
    if year == 2004:
        return build_year_results_2004(year, pdf_path)
    if year == 2005:
        return build_year_results_2005(year, pdf_path)
    if year == 2006:
        return build_year_results_2006(year, pdf_path)
    if year == 2007:
        return build_year_results_2007(year, pdf_path)
    if year == 2008:
        return build_year_results_2008(year, pdf_path)
    if year == 2009:
        return build_year_results_2009(year, pdf_path)
    if year == 2010:
        return build_year_results_2010(year, pdf_path)
    if year == 2011:
        return build_year_results_2011(year, pdf_path)
    if year == 2012:
        return build_year_results_2012(year, pdf_path)
    if year == 2013:
        return build_year_results_2013(year, pdf_path)
    if year == 2014:
        return build_year_results_2014(year, pdf_path)
    if year == 2015:
        return build_year_results_2015(year, pdf_path)
    if year == 2016:
        return build_year_results_2016(year, pdf_path)
    if year == 2017:
        return build_year_results_2017(year, pdf_path)
    if year == 2018:
        return build_year_results_2018(year, pdf_path)
    if year == 2019:
        return build_year_results_2019(year, pdf_path)
    if year == 2020:
        return build_year_results_2020(year, pdf_path)
    if year == 2021:
        return build_year_results_2021(year, pdf_path)

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

    def winner_priority(row):
        round_value = str(row.get("round") or "")
        if round_value == "Heat":
            round_rank = 2
        elif round_value == "Timed Final":
            round_rank = 1
        else:
            round_rank = 0

        section_token = str(row.get("finalGroup") or row.get("heat") or "").upper()
        section_rank = {"A": 0, "1": 0, "B": 1, "2": 1, "C": 2, "3": 2}.get(section_token, 0)
        return (round_rank, section_rank)

    disc_counts = Counter(f"{r['discipline']} {r['gender']}" for r in results)
    print(f"  Found {len(results)} results across {len(disc_counts)} discipline/gender combos:")
    for k, v in sorted(disc_counts.items()):
        candidates = [
            r for r in results
            if f"{r['discipline']} {r['gender']}" == k
            and r['rank'] == 1
            and r.get("round") != "Heat"
        ]
        winner = sorted(candidates, key=winner_priority)[0] if candidates else None
        if winner is None:
            fallback = [r for r in results if f"{r['discipline']} {r['gender']}" == k and r['rank'] == 1]
            winner = sorted(fallback, key=winner_priority)[0] if fallback else None
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

        pdf_path = find_pdf_path(year)
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
