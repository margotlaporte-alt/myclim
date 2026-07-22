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
- `2011`: keep `400 m Dames` finals `A/B/C` as separate classifications. Treat `800 m Hommes B - Zeitläufe` as `Finale B` for storage consistency while keeping it separate from `Finale A`. Reclassify `400m H Elite` as `400m Hurdles`. Merge `Perche Hommes - Finale - Continuation` into the same pole vault final. Use the `Team` column as `club` only when it is not just a duplicate of the athlete country.
- `2012`: keep `400 m` finals `A/B/C` separated for both women and men. Treat `800 m Hommes B - Zeitläufe` as `Finale B` for storage consistency while keeping it separate from `Finale A`. Treat `1500 m` races as single `Timed Final` events. Merge `Perche Dames/Hommes - Continuation` into the same pole vault final. Keep `Kugelstoßen` results. For `Vorläufe`, track the explicit heat number from `Heat 1 of 2` / `Heat 2 of 2`. Use the `Team` column as `club` only when it is not just a duplicate of the athlete country.
- `2013`: keep `400 m` finals `A/B/C` separated for women and men. Keep `800 m Hommes A/B` separated. Store `800 m Dames A - Finale A` as a separated final section. Treat `1500 m` races as single `Timed Final` events. Keep the `heats -> final` link for `60 m` and `60 m Hurdles`. Preserve `False start` / `Fehlstart` as notes on the corresponding `DSQ` rows. Normalize OCR country tokens such as `FR`, `RFA`, and lowercase `fra` to `FRA`. After `2006`, field events keep only the final result value in structured data; do not store attempt-by-attempt detail as exploitable data.
- `2014`: for `60 m Hommes`, heats qualify to both `Finale A` and `Finale B`, but the official event ranking/winner comes from `Finale A`. Keep `Finale A` and `Finale B` as separate stored sections for both `60 m Hommes` and `60 m Dames`. Keep `400 m` finals `A/B/C` separated for women and men. Treat `800 m Dames B - Zeitläufe` as `Finale B` while keeping it separate from `Finale A`. Treat `1500 m` races as single `Timed Final` events. Keep `60 m Hurdles Hommes` heats linked to the final. Keep `High Jump`, `Pole Vault`, and `Long Jump` finals, but after `2006` store only the final result and statuses, not attempt-by-attempt detail as structured exploitable data. Standardize notes such as `Rule 162.6`, `Meeting Record`, and `National Record Indoor`.
- `2015`: keep `60 m Hommes` and `60 m Dames` heats linked to separate `Finale A` / `Finale B` sections, with the official winner coming from `Finale A`. Keep `400 m` finals `A/B/C` separated for women and men. Treat `800 m Hommes - A-/B-Finale` as a mixed `Final 1 / Final 2` style event: keep the source section (`I` / `II`, normalized to `1` / `2`) for each athlete and preserve the global PDF ranking. Treat `800 m Dames`, `1500 m`, and `60 m Hurdles` as simple finals. After `2006`, field events keep only the final result value and status in structured data. Standardize notes such as `Rule 162.6`, `False start`, `National Record Indoor`, and age-category records like `National Record Indoor U20/U23/Senior`.
- `2016`: keep `60 m Women` heats linked to separate `Final A` / `Final B` sections, with the official winner coming from `Final A`. Keep `60 m Men` heats linked to a single final, and keep `60 m Hurdles Men` heats linked to the final. Treat `400 m Women` and `400 m Men` `A-/B-Final` blocks as mixed `Final 1 / Final 2` events: preserve the source section (`I` / `II`, normalized to `1` / `2`) while keeping the overall mixed classification shown by the PDF. Treat `800 m Women`, `800 m Men`, `1500 m Women`, `1500 m Men`, and `3000 m Men` as single timed finals. Keep `Shot Put F42 Men` as a separate discipline from regular `Shot Put`. After `2006`, field events keep only the final result value and status in structured data. Standardize `Meeting Record` notes separately from national records, and use `National Record Indoor` for track events but `National Record` for field events such as `Shot Put`, `Pole Vault`, `High Jump`, and `Long Jump`.
- `2017`: ignore the youth/local relay pages (`5x50m Ludiques Benjamins`, `4x50m Débutants Scolaires`). Keep `60 m Men` and `60 m Women` heats linked to separate `Final A` / `Final B` sections, with the official winner coming from `Final A`. Ignore the standalone `60 m Men - Zeitläufe` rerun and keep the two affected athletes on the official `A-Final` as `DSQ`. Treat `400 m Men`, `400 m Women`, `800 m Men`, and `1500 m Women` as mixed `Final 1 / Final 2` events: preserve the source section (`I` / `II`, normalized to `1` / `2`) while keeping the global mixed ranking shown by the PDF. Treat `1500 m Men` and `800 m Women` as simple finals. Keep `60 m Hurdles Women` heats linked to the final. Merge `High Jump Men/Women - Final - Continuation` and `Long Jump Men - Final - Continuation` into their main finals. After `2006`, field events keep only the final result value and status in structured data. Standardize notes such as `Rule 162.7`, `Rule 145.2`, `Meeting Record`, `National Record Indoor`, and `National Record Indoor U23`; use non-indoor `National Record` labels only for field events.
- `2018`: ignore the local youth pages (`50 m Sprint/Sprong As`, `4x50 m Débutants/Scolaires`) but keep `800 m - Special Olympics` as a separate category-specific discipline. Keep `60 m Women` as a simple final with linked heats. Keep `60 m Men` heats linked to separate `Final A` / `Final B` sections, with the official winner coming from `Final A`; keep the `OC` runner in `Final B` as off-competition and do not let that row affect official rankings. Treat `400 m Men` as a mixed `Final 1 / Final 2` event: preserve the source section (`I` / `II`, normalized to `1` / `2`) while keeping the global mixed ranking shown by the PDF. Treat `800 m Women`, `1500 m Women`, `800 m Men`, and `1500 m Men` as single timed finals. Keep `60 m Hurdles Women` heats linked to the final. Keep `Shot Put F42 Men` as a separate discipline from regular `Shot Put`. After `2006`, field events keep only the final result value and status in structured data. Standardize notes such as `Rule 162.7`, `Meeting Record`, `National Record Indoor`, `National Best U18`, `National Record F42`, and `Meeting Record F42`; keep `Coque record` out of the normalized note set unless explicitly needed later.
- `2019`: keep the `50 m Women` and `50 m Men` results in memory, linked from heats to separate `Final A` / `Final B` sections, but mark them as `Off Silver` because they are not part of the official silver-level discipline set. Ignore `1000 m U16M/U16W` and the local relay pages (`4x50 m`, `5x50 m`). Keep `60 m Women` and `60 m Men` heats linked to separate `Final A` / `Final B` sections, with the official winner coming from `Final A`. Keep `400 m Men` and `800 m Men` `Final A` / `Final B` blocks as separate classifications. Keep `400 m Women`, `800 m Women`, `1500 m Women`, and `800 m - Special Olympics Men` as single timed/final classifications. Merge `1500 m Men - Continuation` and `60 m Hurdles Women - Continuation` back into their main finals. Keep `Shot Put F63 Men` as a separate discipline from regular `Shot Put`, and normalize `New National Record LPC` as `National Record LPC`. After `2006`, field events keep only the final result value and status in structured data. Standardize notes such as `Rule 162.7`, `National Record`, `National Record Indoor`, `National Best Indoor U18`, and age-category national best markers (`U23`, `U20`, `U18`).
- `2020`: keep the `50 m Women` and `50 m Men` results in memory, linked from heats to separate `Finale A` / `Finale B` sections, and mark them as `Off Silver`. Ignore the local youth/relay pages (`5x50 m Ludiques / Benjamins`, `4x50 m Débutants / Scolaires`, `4x200 m Minimes`). Keep `800 m - Special Olympics` as a separate category-specific discipline. Keep `60 m Women` and `60 m Men` heats linked to separate `Finale A` / `Finale B` sections, with the official winner coming from `Finale A`. Keep `60 m Hurdles Men` heats linked to the final. Treat `400 m Men`, `800 m Women`, and `1500 m Men` as mixed `Timed Heats`: preserve the source section (`I` / `II` / `III`, normalized to `1` / `2` / `3`) while keeping the global mixed ranking shown by the PDF. Treat `1500 m Women` as a single timed final even though the PDF labels it `Timed Heats`. Merge the `Continuation` pages for `50 m Women`, `60 m Women`, and `60 m Men` back into their original sections. Keep `Pole Vault Women`, `High Jump Men`, `Triple Jump Women`, and `Shot Put Men` as field-event finals, but after `2006` store only the final result value and statuses, not the attempt-by-attempt detail as exploitable data. Standardize notes such as `Meeting Record`, `Rule 163.3b`, `National Best U18`, and `National Best U20`.
- `2021`: keep `50 m Women` in memory with note `Off Silver`, and keep its single `Vorlauf` linked to the final. Keep `60 m Women` the same way: one qualifying heat linked to the final. Keep `60 m Hurdles Women` and `60 m Hurdles Men` heats linked to their finals. Treat `800 m Women`, `800 m Men`, `1500 m Women`, and `1500 m Men` as single `Timed Final` events even though the PDF labels them `Timed Heats`, because only one race is shown for each discipline. Keep `Shot Put Men`, `High Jump Men`, and `Long Jump Women` as field-event finals, but after `2006` store only the final result value and status, not the attempt-by-attempt detail as exploitable data. Keep `VAN DER WEKEN Patrizia` as `DNF` in both `50 m` and `60 m` heats. Normalize `Meeting Record` on `800 m Men`, keep `NM` for `RIECKE Lea Jasmin`, and normalize `KIPLANGAT CHELANGAT Josephine` as one athlete name.
- `2022`: no results import. The edition was cancelled because of Covid-19, so keep it as a blank cancelled year in `meetingEditions` and do not create `meetingResults`, `meetingRecords`, or `meetingWinners` entries for that year.

### Finals 1 / 2

- If a PDF contains `Final 1` and `Final 2`, keep a mixed overall classification when the PDF presents one.
- Keep the original final for each athlete (`Final 1` or `Final 2`) in the stored data.
- Preserve enough section data to display or filter the two finals separately when needed.

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
