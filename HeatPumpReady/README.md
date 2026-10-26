# Heat Pump Ready? (nuuEnergy challenge)

An honest first heat-pump check for homeowners, built for people aged 45–65, plus an installer view that turns every check into a qualified lead.

## How to run it

**Option A: no setup.** Double-click `index.html`. It opens in any current browser (Chrome, Edge, Safari, Firefox), with no install, no server and no build step. Everything works offline except AI photo reading, which needs an API key (see below).

**Option B: shared link (photo reading on).** Open the link we send in a browser signed in to claude.ai. There, photo reading runs on the viewer's own Claude account, with no key needed. The first photo asks for permission once.

**Installer view:** click *Installer login* at the top right. The demo PIN is `2026`.

## What the homeowner sees

**Quick check: 7 questions, one per screen, about 1–2 minutes**
1. How are the rooms heated?
2. Type of house.
3. Fuel.
4. Heating spend: monthly payment, kWh, or litres of oil. Optionally, a photo or PDF of the energy bill, read by AI.
5. Year built: exact year, or a period if not sure. Renovated? Windows, facade or roof.
6. Living space (or a range if not sure), plus an optional postcode for the local climate.
7. The pipes under a radiator, with simple drawings. If the homeowner is not sure, they add a photo and the AI looks for nuuEnergy's own cues.

"Not sure" is always an answer. It becomes a range, and the result stays honest.

**Result**
- A traffic light and one plain sentence.
- A first savings estimate per year.
- The open points, split the way the challenge asks:
  - *Something has to change first:* an obstacle.
  - *Worth a closer look:* known points.
  - *We can't tell yet from your answers:* missing information, which is not a problem.
- Then *What a technician always checks on site:* exact heating load, radiator sizing room by room, electrical capacity, hydraulics, and outdoor unit placement with sound and permits.
- *How we worked this out* shows both heating-load methods, the efficiency (JAZ) and the prices used.

**Next step, two choices**
1. *Have an expert call me:* name, phone, postcode, best time to call, and consent.
2. *Get my exact savings:* optional quick taps (people, radiators, extras) and photos:
   - Energy bill.
   - **The house from outside**, so the AI checks space for the outdoor unit (bonus challenge).
   - Pipes under a radiator.
   - Boiler display.

   This leads to savings per year and over 20 years, how sure the estimate is, and *Book my free on-site check*.

## What the installer sees (PIN `2026`)

Every lead, including the 5 challenge buildings.
- **Worth a technician visit?** Visit priority from 0 to 100 (*Book a visit / Call first to clarify / Not now*), with the reasons. It is kept separate from the customer's traffic light.
- **Profitable for us?** Heat pump size, project value, extra work (radiators, hydraulic balancing, single-pipe work), margin and complexity. Installation prices are editable placeholders, because the challenge gives none.
- **Before the visit:** questions to ask on the phone and an on-site checklist.
- **Technical summary:** both heating-load methods side by side, flow temperature and JAZ, savings, data confidence, all findings, and the reference values for the development cases.

## Results on the challenge buildings

Run `node tests/check_buildings.js` to reproduce this table. The same rules apply to every house, with no per-building tuning.

| Building | Verdict | Heating load (range) | nuuEnergy reference | Running cost / year: today → heat pump |
|---|---|---|---|---|
| B-01 (dev) | 🟢 green ✓ | 9.8 kW (7.8–11.7) | 9.6 kW, green ✓ | €1,100 → €654 |
| B-02 (dev) | 🟢 green ✓ | 9.0 kW (6.2–10.8) | 9.7 kW, green ✓ | €1,705 → €887 |
| B-03 (dev) | 🟡 yellow ✓ | 16.6 kW (14.1–19.1) | 14.5 kW, yellow ✓ | €6,800 → €2,615–3,269 |
| **B-04 (eval)** | **🟡 yellow** | **9.5 kW (8.1–10.9)** | held by jury | **€4,250 → €2,043** |
| **B-05 (eval)** | **🟡 yellow** | **11.3 kW (5.0–11.3)** | held by jury | **€2,970 → €1,765** |

**B-04: yellow.**
- The heating load is moderate (59 W/m²), and the oil volume (2,500 l) matches the stated 25,000 kWh.
- It has a **single-pipe system**, so the last radiators get cooler water. We calculate with the 55–60 °C efficiency (JAZ 2.8).
- The open points are radiator sizing and the single-pipe loop. Your background page says single-pipe is "not a deal-breaker" but "rarely a clean green" without an on-site check.

**B-05: yellow, and we deliberately don't give a confident number.**
- 27,000 kWh on 125 m² in a 2006 house means about 180 kWh/m² a year for heating. Houses of that age typically use 35–120.
- The tool says the data contradicts itself and names likely causes: wrong floor area, very warm rooms, an old boiler, or the meter serving something else.
- It shows the full range (5.0–11.3 kW) and judges on the safe side.
- It has two heating circuits, so the radiator circuit sets the flow temperature.

## How it decides (all rules in `src/engine.js`)

- **Heating load: both guardrail methods, always shown side by side.**
  - (a) Floor area × W/m² by building age. Stated U-values, renovation (walls and roof count, windows alone don't) and house type adjust the band. Semi-detached and end-of-terrace houses get −15 %, mid-terrace −25 %.
  - (b) Consumption × 0.88 − hot water (1,000 kWh per person), ÷ 2,000 full-load hours. Solar hot water reduces the deduction.
- **Is the bill plausible?** Heating use per m² is compared with what houses of that age typically use. This range is our assumption and is listed in the app.
  - Plausible: the measured use leads (±15 %).
  - Implausibly low or high: the tool says so, names likely causes, and shows the full range.
  - A wood stove makes the bill a lower bound.
- **Flow temperature and efficiency:**
  - Underfloor heating: JAZ 4.0.
  - Radiators at 55 °C deliver about 50 % of their rating, so the tool checks whether they can cover the load. That gives JAZ 3.5, or 2.8 for 55–60 °C.
  - Single-pipe: 55–60 °C.
  - A boiler display reading counts as today's *setting*, not as what the radiators need.
- **Verdict:**
  - 🔴 A real obstacle (for example a measured load above 150 W/m²), or too little data to judge.
  - 🟡 At least one point needs checking.
  - 🟢 Nothing speaks against it.
  - A contradiction in the data only affects the verdict if it moves the house across a threshold. Questions the quick check doesn't ask get fixed defaults (3 people, about one radiator per 12 m²), so they never change the verdict on their own.
- **Costs:** the challenge's fixed prices: heat-pump electricity 26 ct/kWh, gas 11 ct/kWh, oil €1.70/l. Heat pump = useful heat ÷ JAZ × 26 ct. If the JAZ is uncertain, a range is shown. A monthly payment is converted with the fixed price, with up to 15 % allowed for fixed fees.

## AI: where it is used, and where not

AI only **reads inputs** that people can't easily give: the energy bill (photo or PDF), the radiator type, single-pipe hints, the boiler display, and space for the outdoor unit.
- **The verdict itself is rule-based,** so every result can be explained line by line.
- **The pipe prompt follows nuuEnergy's photo guide cue by cue,** including "unclear" as a correct answer for valve blocks that exist in both systems. Low-confidence readings are never applied.
- **Without AI,** photos are kept for the technician and the homeowner types the value.
- **API key (Option A):** Installer login → *Photo reading settings*. The key stays in the browser tab and is sent only to api.anthropic.com.

## Limits (stated honestly)

- Leads are stored in the browser. A production version needs a backend, and could plug into nuuOS.
- Installation prices are placeholders, and so are the plausibility ranges for consumption per m².
- The postcode climate note uses approximate regional design temperatures and does not change the calculation.
- AI photo reading was tested end to end with a simulated model response (PDF bill, pipe photo, boiler, outside wall), not yet with every real-world photo.

## Files

| Path | What it is |
|---|---|
| `index.html` | The complete app in one file. Open it in a browser |
| `src/engine.js` | Assessment rules, ranges, lead scoring (no UI) |
| `src/app.html` | User interface source |
| `build.py` | Rebuilds `index.html` from `src/` and `data/` (`python3 build.py`) |
| `data/` | The challenge buildings (dev + eval) |
| `tests/check_buildings.js` | Reproduces the results table (`node tests/check_buildings.js`) |
