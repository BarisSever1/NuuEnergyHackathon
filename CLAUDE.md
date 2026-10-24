# CLAUDE.md — Heat Pump Ready? (nuuEnergy Challenge)

This file gives Claude (and human contributors) the full context for this repository: what we are building, the domain rules we must follow, the data we have, how the work is judged, and the conventions for writing code here. Read it fully before making changes.

---

## 1. Project in one paragraph

We are building an AI tool for the nuuEnergy challenge ("Buildings & Everyday Energy" track). A homeowner enters what they already have — energy bill, building age, heating system, address, a few smartphone photos — and within **3 minutes** gets an honest first heat-pump-readiness assessment:

1. **A verdict:** green / yellow / red, with a reason a non-expert understands.
2. **What's still open:** what the tool cannot tell from the data, and what a technician must check on site.

The guiding principle of the whole challenge:

> Honesty over precision. A tool that says "I can't tell from this data, a technician must check X and Y" beats one that returns a confident wrong number.

The challenge partner is nuuEnergy (they build nuuOS, installer software for heat-pump projects).

---

## 2. Hard requirements (from the brief)

- Runs **locally in a standard browser**. The demo is live, not slides.
- Time to result for the homeowner: **< 3 minutes**.
- Inputs: data the homeowner already has (bill, building age, heating system, address, photos). No technician visit.
- Output: green / yellow / red + short, understandable reason + list of open points for the technician.
- Must produce results for the **evaluation buildings** (`buildings_eval`), shown in the pitch.
- Must use the **fixed prices and JAZ values** below so all teams are comparable.
- Assumptions must be **shown openly** in the result.

Note: the "Deliverables" page says "3 evaluation buildings", but the dataset contains only **2** (B-04, B-05). Treat the dataset as the source of truth and be ready for the jury to bring an extra unseen building. The tool must therefore work on arbitrary inputs, not just these five.

### Optional bonus challenges
- Automatically read an uploaded energy bill (consumption, energy carrier, costs). Reference format: Stadtwerke München sample bill — https://www.swm.de/dam/doc/kundenservice/rechnung/musterrechnung-erklaerung.pdf (annual kWh is on page 1).
- Installation-risk detection: flag spatial constraints from photos (e.g. where the outdoor unit could realistically go).

---

## 3. Verdict definitions (do not reinterpret)

| Verdict | Meaning |
|---|---|
| 🟢 Green | Likely suitable based on available information. |
| 🟡 Yellow | Potentially suitable, but important checks remain / less data. |
| 🔴 Red | Insufficient evidence for a positive assessment. |

**Critical rule:** missing data does **not** automatically mean unsuitable. The tool must always distinguish between:

- **"There is an obstacle"** — the data shows a real problem (e.g. confirmed single-pipe system, radiators far too small for the load at ≤ 60 °C).
- **"We can't tell yet from this data"** — information is missing or contradictory.

Every verdict must be explainable from the inputs. How we map findings to green/yellow/red is our choice, but the logic must be transparent and visible to the user.

---

## 4. Domain glossary

- **Heating load (Heizlast), kW** — heating power the house needs on the coldest day. Determines heat-pump size.
- **Flow temperature (Vorlauftemperatur), °C** — water temperature going into the radiators. Lower = more efficient heat pump.
- **JAZ (Jahresarbeitszahl)** — seasonal efficiency: kWh of heat per kWh of electricity over a year. JAZ 3.5 → 1 kWh electricity becomes 3.5 kWh heat.
- **Full-load hours (Volllaststunden)** — hours the heating would run at full power to deliver one year's heat. Germany ≈ 2,000 h (realistic 1,800–2,100).
- **Boiler efficiency (Nutzungsgrad)** — share of fuel that ends up as heat. Older boilers ≈ 0.88.
- **Two-pipe system (Zweirohr)** — each radiator has its own supply and return. Standard and fine.
- **Single-pipe system (Einrohr)** — radiators in series on one loop; water cools from radiator to radiator. Critical for heat pumps.
- **Radiator type 11 / 22 / 33** — first digit = number of panels, second = number of fin layers. More = more output. Count panels from a side/top photo.
- **Underfloor heating (Fußbodenheizung, FBH)** — works at ~35 °C. Ideal for heat pumps, but **not required**.
- **Mixed system** — underfloor + radiators. The radiator circuit sets the required flow temperature.

Myth-busting the tool should communicate: underfloor heating is **not** required, and a full renovation is **not** required.

---

## 5. Fixed constants (use exactly these)

```ts
// Prices — fixed by the challenge for comparability
HP_ELECTRICITY_EUR_PER_KWH = 0.26
NATURAL_GAS_EUR_PER_KWH    = 0.11
HEATING_OIL_EUR_PER_LITRE  = 1.70   // ≈ 0.17 €/kWh
// LPG (Flüssiggas): NO price given by the challenge. Any value used must be
// labelled as our own assumption in the UI.

// Heat-pump efficiency by distribution / flow temperature
JAZ_UNDERFLOOR_35C        = 4.0
JAZ_RADIATORS_UP_TO_55C   = 3.5
JAZ_RADIATORS_55_TO_60C   = 2.8

// Conversions and rules of thumb
KWH_PER_LITRE_OIL   = 10
KWH_PER_M3_GAS      = 10
BOILER_EFFICIENCY   = 0.88
HOT_WATER_KWH_PER_PERSON_YEAR = 1000
FULL_LOAD_HOURS     = 2000   // plausible range 1800–2100
INSULATION_HINT_THRESHOLD_W_PER_M2 = 75
RADIATOR_OUTPUT_FACTOR_AT_55C = 0.5   // vs. rated output at 75 °C
```

Keep all constants in one module. Never scatter magic numbers through the code.

---

## 6. Calculation methods (the official guardrails)

All of these are rough rules of thumb, not engineering calculations. Present results as **ranges**, never as falsely precise single numbers.

### 6.1 Heating load — method A: floor area × specific load

```
P_area [kW] = floor_area_m2 × q [W/m²] / 1000
```

| Building | q (W/m²) |
|---|---|
| Unrenovated, built before 1979 | 120–180 |
| Built 1980s–1990s | 80–120 |
| Renovated or built 2002+ | 40–60 |
| Low-energy house / new build | 15–40 |

The table has gaps (1979, 2000–2001) and does not cover "partially renovated". When a building falls between classes, use the wider combined range and say so.

### 6.2 Heating load — method B: from consumption

```
consumption_kwh   = litres_oil × 10   or   m3_gas × 10   (if not already kWh)
useful_heat_kwh   = consumption_kwh × 0.88
space_heat_kwh    = useful_heat_kwh − 1000 × persons      (only if hot water via heating)
P_consumption [kW] = space_heat_kwh / 2000
```

If both methods are available, **show both**, and show the range if they differ. If they differ strongly, explain which one we trust more for this building and why (see §8).

Above ~75 W/m² → add a hint that better windows or insulation may be worth it.

### 6.3 Radiator check

Key question: which flow temperature do the existing radiators need to keep the house warm?

- ≤ 45 °C ideal · ≤ 55 °C efficient · 55–60 °C works but costs more electricity.
- At 55 °C a radiator delivers about **half** its rated (75 °C) output.
- From photos, estimate radiator type (11/22/33) and size, and roughly check whether total radiator output at 55 °C covers the heating load.

Typical signals:
- Underfloor heating → good fit.
- Large or newer panel radiators → usually fine at ≤ 55 °C.
- Small, old radiators or a single-pipe system → flag as "needs checking".

### 6.4 Operating costs

```
cost_today_eur = consumption × fuel_price
cost_hp_eur    = useful_heat_kwh / JAZ × 0.26
```

JAZ comes from the radiator / flow-temperature check (§5). If the flow temperature is uncertain, show the cost as a range across the plausible JAZ values (e.g. 3.5 → 2.8) rather than picking one silently.

Use useful heat **including** hot water for the heat-pump cost if hot water is via the heating system (the heat pump would take over hot water too).

### 6.5 Always for the technician (never claim to have decided these)

- Exact heating load (DIN EN 12831)
- Room-by-room radiator sizing
- Electrical capacity and meter cabinet
- Hydraulics
- Outdoor-unit placement, sound, permits

These must always appear in the "what's still open" list, regardless of verdict.

---

## 7. Single-pipe vs. two-pipe — rules for the tool

From the challenge's background page:

- If `pipe_system` is given, use it.
- If it is `unknown`, the tool may estimate it from photos and construction year, but must show its **confidence and reasoning**.
- If it cannot tell, it must say so, e.g.: *"Heating pipe system unclear from the photos. A technician should check whether this is a single-pipe system, because that can require a higher flow temperature."*
- A **confirmed single-pipe** system is rarely a clean green without an on-site check. It is **not** a deal-breaker (not automatically red).
- Single-pipe was common in 1960s–70s German buildings, especially apartment buildings. Construction year raises the likelihood but is **not proof**.

Photo cues:

| What you see | What it points to |
|---|---|
| Valve at top, return at bottom, two separate unconnected pipes | Likely two-pipe |
| One pipe along wall/skirting from radiator to radiator, often a short bypass piece | Likely single-pipe |
| Single bottom connection, both pipes from floor into one valve | Often single-pipe, but two-pipe versions exist |
| Compact "H-block" valve under radiator with two pipes | Often can't tell; an extra adjustable side port (bypass) points to single-pipe |
| Construction year 1960s–70s, apartment building | Single-pipe more likely, not proof |

Even experienced installers are sometimes unsure from a single photo. The tool must not be more confident than an installer would be.

---

## 8. The dataset

Files (CSV and JSON contain identical records):

- `data/buildings_dev.csv`, `data/buildings_dev.json` — 3 buildings **with** nuuEnergy reference heating load and expected verdict. Use these to build and calibrate.
- `data/buildings_eval.csv`, `data/buildings_eval.json` — 2 buildings, reference values hidden by the jury.

Data are anonymised (PLZ at area level, area and consumption slightly rounded). Empty values mean "not documented", just like in real life. **Some cases are deliberately contradictory.**

### 8.1 Schema

| Field | Type | Notes |
|---|---|---|
| `building_id` | string | `B-01` … |
| `construction_year` | int | |
| `floor_area_m2` | int | May not equal heated area |
| `renovation_status` | enum, often null | `unrenovated` / `partially` / `fully` |
| `heat_distribution` | enum | `radiators` / `underfloor` / `mixed` |
| `annual_consumption_kwh` | int | |
| `energy_carrier` | enum | `gas` / `oil` / `district` / `electric` (LPG is stored as `gas`!) |
| `energy_carrier_detail` | string | Free text, e.g. "heating oil, approx. 2,500 litres per year", "LPG" |
| `radiator_info` | string | Free text |
| `pipe_system` | enum | `two-pipe` / `single-pipe` / `unknown` |
| `flow_temperature_c` | int, often null | **Null in all 5 buildings** |
| `persons_in_household` | int | |
| `hot_water_via_heating` | bool | True in all 5 buildings |
| `rooms` | int, optional | |
| `building_notes` | string | Insulation, extra heat sources, solar thermal… |
| `location` | string | Area level, e.g. "Munich area (82xxx)" |
| `reference_heating_load_kw` | number | Dev only |
| `expected_verdict` | enum | Dev only |

Parsing gotchas:
- `energy_carrier = gas` covers both natural gas and LPG. Always check `energy_carrier_detail` to pick the price.
- Free-text fields (`radiator_info`, `building_notes`, `energy_carrier_detail`) hold critical facts (wood stove, solar thermal, unheated floor, litres of oil). They must be parsed — this is a natural place for an LLM, with the extracted facts shown to the user.
- CSV uses `\r\n` line endings and quoted fields with commas.

### 8.2 The five buildings

| ID | Set | Year | Area | Distribution | Pipes | Carrier | kWh/yr | Persons | Ref. load | Expected |
|---|---|---|---|---|---|---|---|---|---|---|
| B-01 | dev | 2001 | 195 | radiators (14) | unknown | LPG | 10,000 | 4 | 9.6 kW | green |
| B-02 | dev | 2005 | 180 | underfloor + 1 radiator | unknown | natural gas | 15,500 | 3 | 9.7 kW | green |
| B-03 | dev | 1970 | 200 | radiators (15) | two-pipe | oil (~4,000 l) | 40,000 | 2 | 14.5 kW | yellow |
| B-04 | eval | 1987 | 160 | radiators (12, valve blocks) | single-pipe | oil (~2,500 l) | 25,000 | 3 | hidden | hidden |
| B-05 | eval | 2006 | 125 | mixed: underfloor + 8 radiators | unknown | natural gas | 27,000 | 3 | hidden | hidden |

Notes per building:
- **B-01:** No renovation documented, but owner-stated U-values are good (windows 1.1, wall 0.21, basement wall 0.35, roof ~0.24, slab ~0.35 W/m²K). Valves already preset. Radiator type/age not documented.
- **B-02:** Underfloor with 3 balanced manifolds. **Wood stove used all winter. Solar thermal for hot water.**
- **B-03:** Partially renovated: blown-in cavity wall insulation, insulated roof (year unknown), double glazing without low-e. 12 of 15 valves need replacement. **Top floor added in the 1990s, currently not lived in.** 11 rooms. Hamburg area.
- **B-04:** Semi-detached house. No renovation information. Single-pipe confirmed.
- **B-05:** No extra facade/roof insulation, double low-e glazing, **solar thermal present**, 14 rooms, two heating circuits.

### 8.3 Analysis of the dev set (what calibration teaches us)

Applying the official formulas:

| ID | P_consumption | P_area | Reference | Ref. W/m² |
|---|---|---|---|---|
| B-01 | (8,800 − 4,000) / 2,000 = **2.4 kW** | 195 × 40–60 = 7.8–11.7 kW | 9.6 kW | 49 |
| B-02 | (13,640 − 3,000) / 2,000 = **5.3 kW** | 180 × 40–60 = 7.2–10.8 kW | 9.7 kW | 54 |
| B-03 | (35,200 − 2,000) / 2,000 = **16.6 kW** | 200 × 80–180 = 16–36 kW | 14.5 kW | 72.5 |

Lessons:
1. **Neither method is reliable alone.** For the newer houses the consumption method is far too low; for the old partly-renovated house the area method is far too high.
2. **Consumption underestimates when other heat sources exist** (B-02 wood stove) or when hot water is covered by solar thermal (subtracting 1,000 kWh/person then over-corrects).
3. **Implausibly low consumption must be flagged.** B-01 uses ~51 kWh/m²; hot water would be 45 % of the bill. Possible causes: partial occupancy, or the bill misread (LPG is often billed in litres, 1 l ≈ 6.6 kWh).
4. **Area overestimates when part of the area is unheated** (B-03 top floor) or when the building is partially renovated.
5. B-03's reference implies ~2,300–2,400 full-load hours, above the stated 1,800–2,100 range. The rules of thumb are rough; communicate ranges.
6. Expected verdicts: both newer houses are green despite missing radiator details; B-03 is yellow (high load near the 75 W/m² threshold, unknown radiator sizes, valves to replace) — but **not red**.

### 8.4 Known issues in the eval set (do not hard-code answers)

- **B-04:** Consumption method ≈ 9.5 kW (59 W/m²); area method 12.8–19.2 kW. Confirmed single-pipe, and "valve blocks" are consistent with an H-block with bypass. Expect a higher flow temperature → conservative JAZ 2.8.
- **B-05 is the deliberately contradictory case.** 27,000 kWh on 125 m² is ~216 kWh/m² — implausible for a 2006 building, and the solar thermal system should lower it further. 14 rooms in 125 m² (~9 m²/room) suggests the floor area is understated. Consumption method gives ~10.4 kW (83 W/m²), area method 5–7.5 kW. The tool should **flag the contradiction** and ask for the heated area / bill check rather than pick a number. In a mixed system the radiator circuit sets the flow temperature.

**Do not tune logic or thresholds specifically to make B-04/B-05 produce a chosen answer.** Rules must be general and also justified by the dev set and the guardrails. The jury values generalisation ("works across many different homes").

---

## 9. Evaluation criteria (100 points) — design for these

| # | Criterion | Pts | What it means for us |
|---|---|---|---|
| 1 | Technical execution & reliability | 25 | Prototype works end-to-end; calculations plausible; handles all building types incl. contradictory/missing data without crashing. |
| 2 | Problem-solution fit & user value | 25 | A homeowner understands the result and knows the next step. Plain language, no jargon without explanation. |
| 3 | Explainability & handling uncertainty | 20 | Assumptions visible; missing info identified; no misleading conclusions; obstacle vs. unknown clearly separated. |
| 4 | Innovation & smart use of technology | 15 | AI where it genuinely helps (photo reading, bill parsing, free-text extraction, plausibility reasoning) — not a gimmick. |
| 5 | Feasibility & scalability | 15 | Could become a real product; works for many homes without manual effort. |

Prize: €1,000, a table football, and a Tech Day with the nuuEnergy product team.

---

## 10. Design principles for this codebase

1. **Deterministic core, AI at the edges.** The heating-load, cost and verdict logic must be plain, testable, deterministic code using the constants above. Use AI/LLMs/vision for what rules cannot do well: reading bills, extracting facts from free text, interpreting photos (radiator type, pipe system, outdoor-unit space), and phrasing explanations. AI outputs feed the rules engine as **structured facts with a confidence level**, never as the final verdict directly.
2. **Every number carries its provenance.** Each value in the result should know whether it was *given by the user*, *extracted by AI (with confidence)*, *estimated from a rule of thumb*, or *assumed*. Show this in the UI.
3. **Ranges, not point estimates.** Heating load and costs are shown as ranges. A single number only where the input really is precise.
4. **Unknown ≠ bad.** Model three states for every check: `ok`, `obstacle`, `unknown`. Only `obstacle` can push toward red; `unknown` pushes toward yellow and into the technician list.
5. **Plausibility checks are first-class.** Detect and explain contradictions, e.g.: specific consumption implausible for the building age; methods disagreeing by > ~1.5×; rooms vs. area; hot-water share of consumption implausibly high; extra heat sources not on the bill.
6. **Plain language for the homeowner, details on demand.** Lead with verdict + one-sentence reason. Calculations, assumptions and formulas behind an expandable "How we got this" section.
7. **The technician list is always present** and always includes the §6.5 items, plus anything the tool flagged as unknown.
8. **Fast.** The full flow must be completable in < 3 minutes. Few required fields; everything else optional with sensible handling of blanks.
9. **Local-first.** Must run locally in a standard browser for the demo. If an AI API is used, the app must degrade gracefully (rules-only mode) if it is unavailable, and must never block the core assessment.
10. **Privacy.** Homeowner data (address, photos, bills) stays local unless sent to an AI API for a clearly stated purpose. No logging of personal data. Never commit real personal data.

---

## 11. Verdict logic — guidance (to be finalised in code)

The exact mapping is ours to design; keep it in one module with a readable rule table and unit tests. Guidance consistent with the brief and the dev references:

- **Green:** no obstacle found, heating load plausible and reasonably consistent, distribution suits ≤ 55 °C (underfloor, or radiators with no warning signs), pipe system two-pipe or unknown-but-unlikely-single-pipe for a newer building. Missing radiator details alone should **not** block green for a post-2000 building (B-01, B-02 are green with undocumented radiators).
- **Yellow:** potentially suitable but important checks remain — e.g. single-pipe (confirmed or likely), high specific load (≳ 75 W/m²), radiators possibly needing 55–60 °C, significant data contradictions, many valves to replace, old building with unknown radiators.
- **Red:** reserved for **evidence** against suitability — not for missing data. E.g. clear indications that the radiators cannot cover the load even at 60 °C and no realistic fix, or several stacked obstacles. If the tool cannot see such evidence, it should not output red.

Every verdict output must include: the verdict, a one-sentence reason, the list of decisive factors (each tagged ok/obstacle/unknown), the heating-load range with both methods, the cost comparison with assumptions, and the technician checklist.

---

## 12. Testing

- Unit-test every formula against hand-calculated values (§8.3 numbers are a good start).
- Regression tests: the three dev buildings must produce their **expected verdicts**, and the reference heating load should fall inside (or be clearly explained relative to) our reported range.
- Edge-case tests: all-optional-fields-empty input; contradictory input (B-05 style); LPG with no price; oil given in litres; hot water not via heating; mixed distribution; unknown pipe system with old construction year.
- The tool must never crash on null fields or unexpected enum values — it should mark them unknown.
- Eval buildings (B-04, B-05) should be run in tests to ensure they produce a complete, explained result — but do **not** assert a specific verdict for them.

---

## 13. Working conventions for Claude in this repo

- Before changing calculation or verdict logic, re-read §5, §6 and §11. If a change conflicts with the challenge guardrails, stop and flag it instead of silently deviating.
- Keep domain constants in a single config module; reference them by name.
- When adding a rule, add a short comment citing its source (challenge guardrail, background page, or our own assumption) and a test.
- Label our own assumptions (e.g. LPG price, how to classify a 2001 building) explicitly in code and in the UI.
- User-facing text: plain English, short sentences, explain any technical term on first use (glossary in §4). German terms in parentheses are welcome since the users are German homeowners.
- Don't over-engineer. This is a hackathon prototype that must demo reliably; prefer a simple, robust flow over many half-working features. Bonus challenges come only after the core flow works end-to-end.
- Do not invent data, reference values or photos. If something is unknown, the code and the UI must say so.

---

## 14. Source pages

All challenge information comes from the nuuEnergy Notion workspace:
- Main page: Heat Pump Ready? nuuEnergy Challenge
- Subpages: One-Pager · Your Mission · Technical Guardrails · Data Provided · Deliverables & Bonus · Evaluation Criteria · Prize · Background: Single-pipe vs. two-pipe heating

If the challenge pages are updated, update this file accordingly.
