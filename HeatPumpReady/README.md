# Heat Pump Ready? — nuuEnergy Challenge prototype

Open `index.html` in any browser. No install and no server needed. It runs fully offline (only the font loads from Google Fonts if you're online).

## Demo flow (≈ 3 min)
1. **Check a home** → click **B-03**. The tool explains why it's yellow: a high load (95 W/m²), unknown radiator size, and 12 valves to replace.
2. Set **Radiator type → 3 panels (Type 33)**. The radiator check updates live.
3. Click **B-01**. It's green, but the tool flags the contradiction itself: the consumption is implausibly low, so it falls back to the floor-area method. The verdict stays green because the conservative estimate is fine. This is the *honesty over precision* moment.
4. Open **All 5 buildings** for the table with the evaluation results (B-04, B-05).
5. Optional: turn on **AI reading** (Claude API key), then upload a bill or a radiator photo.

## Results
| | Verdict | Load (estimate · range) | Reference |
|---|---|---|---|
| B-01 | 🟢 green ✓ | 9.8 kW · 7.8–11.7 | 9.6 kW ✓ in range |
| B-02 | 🟢 green ✓ | 9.0 kW · 6.2–10.8 | 9.7 kW ✓ in range |
| B-03 | 🟡 yellow ✓ | 16.6 kW · 14.1–19.1 | 14.5 kW ✓ in range |
| **B-04** (eval) | 🟡 yellow | 9.5 kW · 8.1–10.9 | jury |
| **B-05** (eval) | 🟡 yellow | 11.3 kW · 5.0–11.3 | jury |

- **B-04:** The load is moderate (59 W/m², semi-detached house). The oil volume matches the bill. The single-pipe system means it is calculated at JAZ 2.8 and needs an on-site check. This follows the challenge note that single-pipe is not a deal-breaker but is rarely a clean green.
- **B-05:** The data contradicts itself. A 2006 build with 27,000 kWh works out to 90 W/m², while 40–60 W/m² is typical. The tool shows the full range, judges on the safe side and asks for clarification (wrong floor area? something else on the meter?). There are two heating circuits, so the radiator circuit sets the flow temperature.

## How it decides
Every result traces back to a rule in `src/engine.js`:
- **Heating load:** two methods. (a) Floor area × W/m² by age. Stated U-values, renovation and semi-detached houses adjust the band. (b) Consumption × 0.88 − hot water, ÷ 2,000 h. Solar thermal reduces the hot-water deduction.
  - If the two methods agree, consumption leads (±15 %).
  - A second heat source (wood stove) makes consumption a lower bound only.
  - Implausibly low or high consumption is flagged, and the range widens.
- **Flow temperature:** underfloor → 35 °C. Otherwise a known flow temperature, a radiator capacity check (radiators deliver 50 % of their rating at 55 °C), building age, or the pipe system decide it. Single-pipe → 55–60 °C.
- **Verdict:**
  - 🔴 an obstacle (e.g. > 60 °C needed, a measured load > 150 W/m²), or too little data.
  - 🟡 at least one point needs checking.
  - 🟢 nothing points against it.
  - A data contradiction only counts against the verdict if it moves the building across a threshold.
- **Costs:** the challenge's fixed prices. Heat pump = useful heat ÷ JAZ × 26 ct. If the JAZ is uncertain, a range is shown.

## AI (optional)
With a Claude API key (stored only in the browser tab), Claude reads:
- **bills:** consumption, fuel, cost, and whether the bill covers a full year
- **radiator photos:** type 11/22/33, a pipe-layout hint, and its confidence
- **outside photos:** space for the outdoor unit

The AI fills inputs. It never decides the verdict, so the logic stays transparent. Without a key, the user picks the radiator type manually.

## Files
- `index.html`: the complete app (built file)
- `src/engine.js`: assessment rules
- `src/app.html`: UI
- `data/`: the challenge buildings
- `build.py`: rebuilds `index.html` after edits (`python3 build.py`)
