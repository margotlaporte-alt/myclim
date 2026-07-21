# Meeting History Reimport Rules

Reference rules for rebuilding CMCM meeting statistics year by year from PDFs.

## Scope

These rules apply to the historical meeting data stored in:

- `meetingResults`
- `meetingRecords`
- `meetingWinners`

The reimport is done year by year after understanding the specific PDF for that year.

## Parsing Rules

### Youth categories

- Youth categories must not be kept in the historical meeting statistics.
- If a PDF includes youth categories, exclude them from the imported historical memory.
- More broadly, keep only the international events in the historical meeting statistics.
- Local-only events such as local relay formats must be excluded.

### Heats / series

- Heats (series) must be kept as heats.
- Each heat must be linked to its corresponding final when a final exists.
- Heats do not decide winners or final rankings.
- Final results are the source of truth for winners and rankings.
- Keep enough data to know in which heat or final section each athlete competed.

### Finals A / B

- If a PDF contains `Final A` and `Final B`, combine the times from both finals.
- The combined times establish the overall ranking.
- Winners and final classification come from that combined ranking.
- Even when the rankings are combined, keep the original final for each athlete (`Final A` or `Final B`).
- Exception: some years can override this default rule after PDF review.
- Confirm the intended treatment year by year before saving data.

### Known exceptions

- `2004`: keep `Final A` and `Final B` as separate classifications. Do not combine them.
- `2006`: keep `Final A` and `Final B` as separate classifications. Do not combine them.
- `2007`: keep `Final A` and `Final B` as separate classifications. Do not combine them.
- `2008`: keep `Final A` and `Final B` as separate classifications. Keep `400 m` finals `A/B/C` as separate classifications as well.
- `2009`: keep `Final A` and `Final B` as separate classifications. Ignore the recombined `400 m Hommes - Finale` recap and keep `Finale A/B` as the source data.
- `2010`: keep `400 m` finals `A/B/C` as separate classifications. Keep `800 m Hommes B - Zeitläufe` separate from `Finale A`. In combined `Série` blocks, recover each athlete's heat from tokens like `1./II` or `3./III`.

### Finals 1 / 2

- If a PDF contains `Final 1` and `Final 2`, `Final 1` is the winning final.
- Winners come from `Final 1`.
- `Final 2` does not override the winner of `Final 1`.
- Keep the original final for each athlete (`Final 1` or `Final 2`) in the stored data.

## Data normalization

- Store one normalized performance format across all years.
- Keep one consistent structured status model across all documents for special outcomes such as:
  - `DSQ`
  - `DNF`
  - `DNS`
  - abandonment
- Preserve the source context needed to trace how the result was interpreted from the PDF.

### Year-specific PDF differences

- Every year can have different PDF structure, language, labels, and layout.
- Before validating extraction for a year, review the PDF carefully.
- Ask clarification questions for each year's PDF before locking the parsing logic.

## Workflow

1. Understand the PDF for the selected year.
2. Ask year-specific questions about its structure if anything is ambiguous.
3. Build or adapt the extraction script for that year.
4. Validate the extracted results against the PDF.
5. Save the cleaned data to Firestore for that year.
6. Continue to the next year only after the current year is confirmed.

## Reset Policy

Before a full historical rebuild, clear the current meeting statistics collections:

- `meetingResults`
- `meetingRecords`
- `meetingWinners`

Do not clear `meetingEditions` as part of the stats reset unless explicitly requested.
