/* Heat Pump Ready? — assessment engine
 * Pure functions, no DOM. Every number it produces carries the rule that made it,
 * so the UI can show the reasoning, not just the result.
 */
(function (root) {
  'use strict';

  // ---- Fixed challenge assumptions -------------------------------------------------
  const A = {
    priceHP: 0.26,          // €/kWh heat-pump electricity
    priceGas: 0.11,         // €/kWh natural gas
    priceOilL: 1.70,        // €/litre heating oil
    priceOil: 0.17,         // €/kWh heating oil (≈ 1.70 €/l ÷ 10 kWh/l)
    kWhPerLitreOil: 10,
    kWhPerM3Gas: 10,
    boilerEff: 0.88,
    hotWaterPerPerson: 1000, // kWh/a
    solarHotWaterShare: 0.6, // share of hot water a solar-thermal system typically covers (our assumption)
    fullLoadHours: 2000,
    jaz: { underfloor: 4.0, upTo55: 3.5, upTo60: 2.8 },
    radiatorDerate55: 0.5,   // radiator at 55 °C gives ~half of its 75 °C rating
    // typical rated output (75 °C) of a 600 mm high, 1.0 m long panel radiator, kW
    radiatorRated: { '11': 1.0, '21': 1.4, '22': 1.8, '33': 2.6 },
    insulationHintWm2: 75,
  };

  // lo/hi: W/m² from the guardrails. plaus: plausible space-heating use in kWh/m²·year (our assumption, typical German stock)
  const BANDS = {
    pre1979: { lo: 120, hi: 180, plaus: [60, 350], label: 'unrenovated, built before 1979' },
    y1979to2001: { lo: 80, hi: 120, plaus: [40, 220], label: 'built 1979–2001' },
    partial1979to2001: { lo: 60, hi: 100, plaus: [35, 180], label: 'built 1979–2001, partially renovated' },
    renovated: { lo: 40, hi: 60, plaus: [35, 120], label: 'renovated or built 2002+' },
    lowEnergy: { lo: 15, hi: 40, plaus: [15, 80], label: 'low-energy house / new build' },
  };

  // ---- Small helpers --------------------------------------------------------------
  const num = (v) => (v === null || v === undefined || v === '' || isNaN(+v) ? null : +v);
  const r1 = (x) => Math.round(x * 10) / 10;
  const r0 = (x) => Math.round(x);
  const fmtKw = (x) => (Math.round(x * 10) / 10).toLocaleString('en');
  const has = (txt, re) => !!(txt && re.test(txt));

  // ---- 1. Read the free-text fields ------------------------------------------------
  // Rule-based reader. With an API key the UI can replace this with an AI reading,
  // but the output shape is the same so the engine never depends on AI.
  function readFreeText(b) {
    const notes = [b.building_notes, b.radiator_info, b.energy_carrier_detail].filter(Boolean).join(' . ');
    const f = {};
    const u = (re) => { const m = notes.match(re); return m ? parseFloat(m[1].replace(',', '.')) : null; };
    f.uWindow = u(/windows?[^0-9]{0,20}([0-9]+[.,][0-9]+)/i);
    f.uWall = u(/(?:external|exterior|outer)\s*wall[^0-9]{0,20}([0-9]+[.,][0-9]+)/i);
    f.uRoof = u(/roof[^0-9]{0,20}([0-9]+[.,][0-9]+)/i);
    f.extraHeatSource = has(notes, /wood\s*stove|fireplace|kaminofen|kachelofen|tiled stove|pellet stove/i);
    f.solarThermal = has(notes, /solar\s*thermal|solarthermie/i);
    f.unheatedArea = has(notes, /not lived in|unheated|not heated|unbeheizt|unused/i);
    f.semiDetached = has(notes, /semi-detached|doppelhaush|terraced|reihenhaus|row house/i);
    f.noInsulation = has(notes, /no (additional )?insulation|ungedämmt|uninsulated/i);
    f.someInsulation = !f.noInsulation && has(notes, /insulat|dämm/i);
    f.lowE = has(notes, /low-e/i) && !has(notes, /without low-e/i);
    f.lpg = has(notes, /lpg|flüssiggas|liquefied/i);
    const lit = notes.match(/([0-9][0-9.,]*)\s*(?:litres|liters|l)\b/i);
    f.oilLitres = lit ? parseFloat(lit[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) : null;
    const rc = (b.radiator_info || '').match(/(\d+)\s*radiators?/i);
    f.radiatorCount = rc ? +rc[1] : null;
    const vr = (b.radiator_info || '').match(/(\d+)\s*valves?\s*(?:would\s*)?need/i);
    f.valvesToReplace = vr ? +vr[1] : null;
    f.radiatorTypeKnown = /typ(?:e)?\s*(11|21|22|33)/i.test(b.radiator_info || '') ? (b.radiator_info.match(/typ(?:e)?\s*(11|21|22|33)/i)[1]) : null;
    return f;
  }

  // ---- 2. Heating load -------------------------------------------------------------
  function areaBand(b, f) {
    const y = num(b.construction_year);
    const ren = b.renovation_status || null;
    const goodEnvelope = f.uWall !== null && f.uWall <= 0.30 && (f.uWindow === null || f.uWindow <= 1.4);
    let band, why;
    if (y === null) return null;
    if (y >= 2016) { band = BANDS.lowEnergy; why = 'built 2016 or later'; }
    else if (ren === 'fully' || y >= 2002) { band = BANDS.renovated; why = ren === 'fully' ? 'fully renovated' : 'built 2002 or later'; }
    else if (goodEnvelope) { band = BANDS.renovated; why = `stated U-values (wall ${f.uWall}, windows ${f.uWindow ?? '–'} W/m²K) are at 2002+ level`; }
    else if (y < 1979 && ren === 'partially') { band = BANDS.y1979to2001; why = 'built before 1979 but partially renovated → one class better'; }
    else if (y < 1979) { band = BANDS.pre1979; why = 'built before 1979, no renovation documented'; }
    else if (ren === 'partially') { band = BANDS.partial1979to2001; why = 'built 1979–2001, partially renovated'; }
    else { band = BANDS.y1979to2001; why = 'built 1979–2001'; }
    return { ...band, why };
  }

  function heatLoad(b, f) {
    const area = num(b.floor_area_m2);
    const out = { area, flags: [], method: {} };

    // a) floor area × W/m²
    const band = areaBand(b, f);
    if (area && band) {
      let lo = band.lo, hi = band.hi;
      // fewer exposed walls → less heat loss
      const hf = f.houseFactor != null ? f.houseFactor : (f.semiDetached ? 0.85 : 1);
      const hl = f.houseLabel || 'semi-detached';
      lo *= hf; hi *= hf;
      out.method.area = { plaus: band.plaus, lo: area * lo / 1000, hi: area * hi / 1000, mid: area * (lo + hi) / 2000, wm2: [r0(lo), r0(hi)], why: band.why + (hf < 1 ? `; ${hl} (−${Math.round((1 - hf) * 100)} %, fewer exterior walls)` : '') };
    }

    // b) from consumption
    let kwh = num(b.annual_consumption_kwh);
    let kwhSource = 'bill';
    if (kwh === null && f.oilLitres) { kwh = f.oilLitres * A.kWhPerLitreOil; kwhSource = 'oil litres × 10'; }
    if (kwh !== null) {
      const persons = num(b.persons_in_household) ?? 2;
      const hwFull = b.hot_water_via_heating === false ? 0 : persons * A.hotWaterPerPerson;
      const hw = f.solarThermal ? hwFull * (1 - A.solarHotWaterShare) : hwFull;
      const useful = kwh * A.boilerEff;
      const space = Math.max(useful - hw, 0);
      const kw = space / A.fullLoadHours;
      out.method.consumption = { kwh, kwhSource, useful, hw, space, kw, wm2: area ? kw * 1000 / area : null, persons, personsAssumed: num(b.persons_in_household) === null };
    }

    const c = out.method.consumption, a = out.method.area;
    // consistency checks
    if (f.oilLitres && num(b.annual_consumption_kwh)) {
      const fromL = f.oilLitres * A.kWhPerLitreOil;
      const dev = Math.abs(fromL - kwh) / kwh;
      if (dev > 0.15) out.flags.push({ kind: 'contradiction', text: `The bill says ${kwh.toLocaleString('en')} kWh, but ${f.oilLitres.toLocaleString('en')} litres of oil would be about ${fromL.toLocaleString('en')} kWh.` });
      else out.flags.push({ kind: 'consistent', text: `Oil volume (${f.oilLitres.toLocaleString('en')} l ≈ ${fromL.toLocaleString('en')} kWh) matches the stated consumption.` });
    }

    let mode = 'none';
    if (c && a) {
      if (f.extraHeatSource) { mode = 'consumption-lower-bound'; out.flags.push({ kind: 'underestimate', text: 'Another heat source (e.g. a wood stove) covers part of the heating today, so the bill understates what the heat pump will have to deliver.' }); }
      // Plausibility: space-heating use per m² against what houses of this age typically use.
      const spec = c.space / area;
      c.spec = spec;
      const [pMin, pMax] = a.plaus;
      if (f.extraHeatSource) { /* lower bound, set above */ }
      else if (spec < pMin) { mode = 'consumption-too-low'; out.flags.push({ kind: 'contradiction', text: `Your bill means about ${r0(spec)} kWh per m² a year for heating. Houses like this usually use ${pMin}–${pMax}. Possible reasons: a bill for part of the year, a second heat source, rooms not heated, or a typo.` }); }
      else if (spec > pMax) { mode = 'consumption-too-high'; out.flags.push({ kind: 'contradiction', text: `Your bill means about ${r0(spec)} kWh per m² a year for heating. Houses like this usually use ${pMin}–${pMax}. Possible reasons: a wrong floor area, very warm rooms, an old boiler, or the meter also serves something else.` }); }
      else mode = 'consumption-primary';
      if (f.unheatedArea) out.flags.push({ kind: 'note', text: 'Part of the house is currently not lived in. The bill reflects today\'s use; if those rooms get heated later, the load goes up.' });
    } else if (c) mode = 'consumption-only';
    else if (a) mode = 'area-only';

    let best, lo, hi, basis;
    switch (mode) {
      case 'consumption-primary': best = c.kw; lo = c.kw * 0.85; hi = c.kw * 1.15; basis = `From your consumption: ${fmtKw(lo)}–${fmtKw(hi)} kW. From floor area and age: ${fmtKw(a.lo)}–${fmtKw(a.hi)} kW. Your measured use is plausible for this house, so it leads.`; break;
      case 'consumption-lower-bound': best = Math.max(c.kw, a.mid); lo = Math.min(c.kw, a.lo); hi = a.hi; basis = 'Consumption is only a lower bound here, so the floor-area estimate leads.'; break;
      case 'consumption-too-low': best = a.mid; lo = a.lo; hi = a.hi; basis = 'Consumption looks implausibly low, so the floor-area estimate is used.'; break;
      case 'consumption-too-high': best = c.kw; lo = a.lo; hi = c.kw; basis = 'The two methods disagree strongly. We show the full range and assess with the higher value to stay on the safe side.'; break;
      case 'consumption-only': best = c.kw; lo = c.kw * 0.85; hi = c.kw * 1.15; basis = 'Based on consumption only (no year or floor area).'; break;
      case 'area-only': best = a.mid; lo = a.lo; hi = a.hi; basis = 'Based on floor area and building age only (no consumption).'; break;
      default: best = null;
    }
    // What the verdict is judged on: measured use when it is plausible, otherwise the cautious upper end.
    const judgeKw = mode === 'consumption-primary' || mode === 'consumption-only' ? c.kw * 1.15 : hi;
    Object.assign(out, { mode, best, lo, hi, basis, judgeKw });
    if (best !== null && area) { out.wm2Best = best * 1000 / area; out.wm2Hi = judgeKw * 1000 / area; }
    return out;
  }

  // ---- 3. Heat distribution & flow temperature ------------------------------------
  function distribution(b, f, load, extra) {
    const dist = b.heat_distribution || 'unknown';
    const y = num(b.construction_year);
    const flow = num(b.flow_temperature_c);
    const count = num(extra.radiatorCount) ?? f.radiatorCount;
    const type = extra.radiatorType || f.radiatorTypeKnown || null;
    const pipe = b.pipe_system || 'unknown';
    const res = { dist, flowClass: null, jaz: null, jazRange: null, findings: [], perRadiator: null };

    if (dist === 'underfloor') {
      res.flowClass = 'underfloor'; res.jaz = A.jaz.underfloor;
      res.findings.push({ status: 'ok', area: 'Heating system', title: 'Underfloor heating — a very good match', text: 'Underfloor heating runs at about 35 °C, where a heat pump is at its most efficient.' });
      if (count) res.findings.push({ status: 'note', area: 'Heating system', title: `${count} extra radiator${count > 1 ? 's' : ''}`, text: 'A single radiator (often in the bathroom) may stay slightly cooler at 35 °C; an electric towel heater or a larger model usually solves this.' });
      return res;
    }

    // radiators or mixed: the radiator circuit decides the flow temperature
    // A boiler's current setting is not the temperature the radiators need: old boilers usually run hotter than necessary.
    const setp = num(extra.boilerSetpoint);
    if (flow === null && setp !== null) {
      if (setp <= 55) { res.flowClass = 'upTo55'; res.jaz = A.jaz.upTo55; res.findings.push({ status: 'ok', area: 'Flow temperature', title: `Boiler set to ${setp} °C`, text: 'Your heating already runs at 55 °C or less, where heat pumps work efficiently.' }); }
      else res.findings.push({ status: 'check', area: 'Flow temperature', title: `Boiler set to ${setp} °C today`, text: 'Many boilers are set hotter than the radiators really need. A technician tests whether 55 °C keeps the rooms warm; that decides the running cost.' });
    }
    if (flow !== null) {
      if (flow <= 55) { res.flowClass = 'upTo55'; res.jaz = A.jaz.upTo55; res.findings.push({ status: 'ok', area: 'Flow temperature', title: `Flow temperature ${flow} °C`, text: 'Your system already runs at ≤ 55 °C, where heat pumps work efficiently.' }); }
      else if (flow <= 60) { res.flowClass = 'upTo60'; res.jaz = A.jaz.upTo60; res.findings.push({ status: 'check', area: 'Flow temperature', title: `Flow temperature ${flow} °C`, text: 'Works, but costs more to run. Lowering the flow temperature (larger radiators, hydraulic balancing) would cut running costs.' }); }
      else { res.flowClass = 'above60'; res.jaz = A.jaz.upTo60; res.findings.push({ status: 'blocker', area: 'Flow temperature', title: `Flow temperature ${flow} °C`, text: 'Above 60 °C a heat pump is expensive to run. The radiators or insulation would need upgrading first — a technician should confirm what\'s needed.' }); }
    }

    // radiator capacity check
    if (load.best && count) {
      const radShare = dist === 'mixed' ? 0.5 : 1; // mixed: we don't know the split; assume half the load on radiators
      const need55 = load.best * radShare / count;
      const needRated = need55 / A.radiatorDerate55;
      res.perRadiator = { need55, needRated, count, radShare };
      let level;
      if (needRated <= A.radiatorRated['11']) level = 'small';
      else if (needRated <= A.radiatorRated['22']) level = 'typical';
      else if (needRated <= A.radiatorRated['33']) level = 'large';
      else level = 'too-large';
      res.perRadiator.level = level;

      const needTxt = `Each radiator has to deliver about ${r1(need55)} kW at 55 °C, which means a rating of about ${r1(needRated)} kW at 75 °C`;
      if (type) {
        const cap = count * A.radiatorRated[type] * A.radiatorDerate55;
        const ok = cap >= load.best * radShare;
        res.findings.push({ status: ok ? 'ok' : 'check', area: 'Radiators', title: `Type ${type} radiators: ${ok ? 'enough' : 'probably not enough'} at 55 °C`, text: `${count} × Type ${type} (≈ ${A.radiatorRated[type]} kW each at 75 °C, 1 m long) give ≈ ${r1(cap)} kW at 55 °C vs. ${r1(load.best * radShare)} kW needed.` + (ok ? '' : ' A few larger radiators in the coldest rooms usually fix this.') });
        if (res.flowClass === null) { res.flowClass = ok ? 'upTo55' : 'upTo60'; res.jaz = ok ? A.jaz.upTo55 : A.jaz.upTo60; }
      } else {
        const newer = y !== null && y >= 1995;
        const lvlTxt = { small: 'even small single-panel radiators (Type 11) would do', typical: 'that is a normal double-panel radiator (Type 22, ~1 m)', large: 'that needs large triple-panel radiators (Type 33)', 'too-large': 'more than typical radiators deliver' }[level];
        const status = level === 'small' || (level === 'typical' && newer) ? 'ok' : 'check';
        res.findings.push({ status, area: 'Radiators', title: status === 'ok' ? 'Radiators are likely big enough' : 'Radiator size unknown — needs a look', text: `${needTxt}; ${lvlTxt}. Type and size aren't documented${newer ? ', but radiators in houses from this period are usually sized generously' : ''}. A photo of a radiator from the side would settle it.` });
        if (res.flowClass === null) {
          if (status === 'ok') { res.flowClass = 'upTo55'; res.jaz = A.jaz.upTo55; }
          else { res.flowClass = 'unknown'; res.jazRange = [A.jaz.upTo60, A.jaz.upTo55]; res.jaz = A.jaz.upTo60; }
        }
      }
    } else if (res.flowClass === null) {
      res.flowClass = 'unknown'; res.jazRange = [A.jaz.upTo60, A.jaz.upTo55]; res.jaz = A.jaz.upTo60;
      res.findings.push({ status: 'check', area: 'Radiators', title: 'Radiators not described', text: 'Number, type and size of the radiators are unknown, so we can\'t estimate the flow temperature yet.' });
    }

    if (dist === 'mixed') res.findings.push({ status: 'check', area: 'Heating system', title: 'Two heating circuits (underfloor + radiators)', text: 'The radiator circuit sets the temperature the heat pump must reach; the underfloor part gets mixed down. We assumed about half the load sits on the radiators.' });

    if (f.valvesToReplace) res.findings.push({ status: 'check', area: 'Radiators', title: `${f.valvesToReplace} valves need replacing`, text: 'New presettable valves plus hydraulic balancing (hydraulischer Abgleich) are a standard, inexpensive step that lets the system run at lower temperatures.' });

    // pipe system
    if (pipe === 'single-pipe') {
      res.findings.push({ status: 'check', area: 'Pipe system', title: 'Single-pipe system (Einrohrheizung)', text: 'Not a deal-breaker, but the last radiators on the loop get cooler water, so the system usually needs a higher flow temperature. We calculate with the 55–60 °C efficiency. On site: larger radiators at the end of the loop, or converting parts to two-pipe.' });
      if (res.flowClass !== 'above60') { res.flowClass = 'upTo60'; res.jaz = A.jaz.upTo60; res.jazRange = null; }
    } else if (pipe === 'two-pipe') {
      res.findings.push({ status: 'ok', area: 'Pipe system', title: 'Two-pipe system', text: 'Every radiator gets water at the same temperature — the standard, heat-pump-friendly layout.' });
    } else {
      const likelyTwo = y !== null && y >= 1980;
      res.findings.push({ status: likelyTwo ? 'note' : 'check', area: 'Pipe system', title: 'Pipe system not documented', text: likelyTwo ? 'Single-pipe systems were mainly built in the 1960s–70s, so for this house two-pipe is very likely. Worth a quick confirmation on site.' : 'Houses from this period sometimes have single-pipe systems, which make heat pumps harder. A photo of the pipes under a radiator helps; a technician can confirm.' });
    }
    return res;
  }

  // ---- 4. Running costs ------------------------------------------------------------
  function costs(b, f, load, dist) {
    const c = load.method.consumption;
    if (!c) return null;
    const carrier = b.energy_carrier;
    let todayPrice = null, todayLabel = '', assumption = null;
    if (carrier === 'oil') { todayPrice = A.priceOil; todayLabel = 'heating oil at 1.70 €/l (≈ 17 ct/kWh)'; }
    else if (carrier === 'gas') { todayPrice = A.priceGas; todayLabel = f.lpg ? 'LPG, priced like natural gas at 11 ct/kWh' : 'natural gas at 11 ct/kWh'; if (f.lpg) assumption = 'The challenge sets no LPG price, so we used the natural-gas price. LPG is usually more expensive, so the real saving is likely larger.'; }
    else if (carrier === 'electric') { todayPrice = A.priceHP; todayLabel = 'electricity at 26 ct/kWh'; }
    const today = todayPrice !== null ? c.kwh * todayPrice : null;
    const jazs = dist.jazRange ? dist.jazRange : [dist.jaz];
    const hp = jazs.map((j) => (c.useful / j) * A.priceHP);
    return { today, todayLabel, hp: { lo: Math.min(...hp), hi: Math.max(...hp) }, jazs, useful: c.useful, assumption };
  }

  // ---- 5. Verdict ------------------------------------------------------------------
  function assess(b, extra = {}) {
    const f = { ...readFreeText(b), ...(extra.textFacts || {}) };
    const load = heatLoad(b, f);
    const dist = distribution(b, f, load, extra);
    const cost = costs(b, f, load, dist);
    const findings = [];

    // missing basics
    const missing = [];
    if (num(b.floor_area_m2) === null) missing.push('floor area');
    if (num(b.construction_year) === null) missing.push('construction year');
    if (num(b.annual_consumption_kwh) === null && !f.oilLitres) missing.push('annual consumption');

    // heating-load finding
    if (load.best !== null && load.area) {
      const wm2 = load.wm2Hi; // judge with the upper end: safe side
      const range = `${r1(load.lo)}–${r1(load.hi)} kW`;
      let status, title, text;
      if (wm2 <= A.insulationHintWm2) { status = 'ok'; title = `Heating load around ${r1(load.best)} kW`; text = `${range} (${r0(load.wm2Best)} W/m²). A normal size for a single-family heat pump.`; }
      else if (wm2 <= 150) { status = 'check'; title = `Heating load on the high side (~${r1(load.best)} kW)`; text = `${range}, up to ${r0(wm2)} W/m². Above ~75 W/m², better windows or insulation are worth considering: they cut the size and running cost of the heat pump.`; }
      else if (load.mode === 'area-only' || load.mode === 'consumption-too-low') { status = 'check'; title = `Possibly a very high heating load (up to ${r0(wm2)} W/m²)`; text = `${range}. That's typical for unrenovated houses of this age — but it's a statistical value. Your yearly consumption from the bill would show what your house really needs.`; }
      else { status = 'blocker'; title = `Very high heating load (${r0(wm2)} W/m²)`; text = `${range}. At this level the radiators would need very hot water. Insulation should come first, or at least be planned together with the heat pump.`; }
      findings.push({ status, area: 'Heating load', title, text, detail: load.basis });
    }
    load.flags.filter((x) => x.kind === 'contradiction').forEach((x) => {
      // a contradiction only matters for the verdict if it moves the building across a threshold
      const crosses = load.lo * 1000 / load.area <= A.insulationHintWm2 && load.wm2Hi > A.insulationHintWm2;
      findings.push({ status: crosses ? 'check' : 'note', area: 'Data', title: 'Your data doesn\'t add up', text: x.text + (crosses ? ' This changes the result, so it needs clarifying.' : ' It doesn\'t change the verdict, because even the conservative estimate is fine.') });
    });
    load.flags.filter((x) => x.kind === 'underestimate' || x.kind === 'note').forEach((x) => findings.push({ status: 'note', area: 'Data', title: x.kind === 'underestimate' ? 'Second heat source' : 'Unused rooms', text: x.text }));
    load.flags.filter((x) => x.kind === 'consistent').forEach((x) => findings.push({ status: 'ok', area: 'Data', title: 'Bill is consistent', text: x.text }));
    findings.push(...dist.findings);
    if (extra.installFindings) findings.push(...extra.installFindings);

    let verdict;
    if (missing.length >= 2 || load.best === null) verdict = 'red';
    else if (findings.some((x) => x.status === 'blocker')) verdict = 'red';
    else if (findings.some((x) => x.status === 'check') || missing.length) verdict = 'yellow';
    else verdict = 'green';

    const headline = {
      green: 'Likely ready for a heat pump',
      yellow: 'Probably workable — a few things need checking',
      red: verdict === 'red' && (missing.length >= 2 || load.best === null) ? 'Not enough information yet' : 'Not ready without changes',
    }[verdict];

    const checks = findings.filter((x) => x.status === 'check' || x.status === 'blocker');
    const reason = verdict === 'green'
      ? 'Nothing in your data points against a heat pump. ' + (dist.flowClass === 'underfloor' ? 'Underfloor heating makes it an easy fit.' : 'The heating load is moderate and the radiators should manage at 55 °C.')
      : verdict === 'red' && (missing.length >= 2 || load.best === null) ? `We're missing ${missing.join(' and ')}. That's not a "no" — we just can't judge yet.`
      : checks.map((x) => x.title.replace(/ —.*$/, '')).slice(0, 3).join(' · ');

    const technician = [
      { title: 'Exact heating load', text: 'A room-by-room calculation (DIN EN 12831) replaces our estimate and sets the heat-pump size.' },
      { title: 'Radiator sizing, room by room', text: 'Whether each radiator delivers enough heat at a low flow temperature.' },
      { title: 'Electrical capacity', text: 'Meter cabinet and house connection must handle the heat pump.' },
      { title: 'Hydraulics', text: 'Pipes, pumps, valves and hydraulic balancing.' },
      { title: 'Outdoor unit placement', text: 'Space, a short pipe route, sound distance to neighbours and any permits.' },
    ];
    checks.forEach((x) => technician.push({ title: x.title.replace(/ —.*$/, ''), text: 'Flagged above.', fromFindings: true }));

    const assumptions = [
      `Boiler efficiency ${A.boilerEff} (old boiler loses ~12 %)`,
      `Hot water ${A.hotWaterPerPerson.toLocaleString('en')} kWh per person per year${f.solarThermal ? `, of which solar thermal covers ~${A.solarHotWaterShare * 100} % (our assumption)` : ''}`,
      `${A.fullLoadHours.toLocaleString('en')} full-load hours per year (realistic: 1,800–2,100; our ±15 % range covers this)`,
      `JAZ ${A.jaz.underfloor} underfloor · ${A.jaz.upTo55} radiators ≤ 55 °C · ${A.jaz.upTo60} radiators 55–60 °C`,
      `Prices: heat-pump electricity ${A.priceHP * 100} ct/kWh · gas ${A.priceGas * 100} ct/kWh · oil ${A.priceOilL.toFixed(2)} €/l`,
      `Radiators at 55 °C deliver ~50 % of their 75 °C rating; reference sizes 600 × 1000 mm: Type 11 ≈ 1.0 kW, 22 ≈ 1.8 kW, 33 ≈ 2.6 kW`,
    ];
    if (load.method.consumption && load.method.consumption.personsAssumed) assumptions.push('Household size not given — assumed 2 persons');
    if (load.method.area && load.method.consumption) assumptions.push(`Plausibility check (our assumption): houses in this class typically use ${load.method.area.plaus[0]}–${load.method.area.plaus[1]} kWh per m² a year for heating`);
    if (cost && cost.assumption) assumptions.push(cost.assumption);

    return { id: b.building_id, input: b, facts: f, load, dist, cost, findings, verdict, headline, reason, technician, assumptions, missing };
  }

  // ---- 6. Uncertain answers: run low / mid / high and combine ----------------------
  // Any numeric field may be a number or {lo, hi}. 'Not sure' answers become ranges.
  const RANGE_FIELDS = ['floor_area_m2', 'annual_consumption_kwh', 'construction_year', 'persons_in_household'];
  const isR = (v) => v && typeof v === 'object' && 'lo' in v && 'hi' in v;
  const pick = (v, k) => (isR(v) ? (k === 'mid' ? (v.lo + v.hi) / 2 : v[k]) : v);

  function assessRange(b, extra = {}) {
    const uncertain = RANGE_FIELDS.filter((k) => isR(b[k]));
    if (isR(extra.radiatorCount)) uncertain.push('radiator_count');
    const build = (k) => {
      const o = { ...b };
      RANGE_FIELDS.forEach((f) => { o[f] = pick(b[f], k); });
      if (o.construction_year != null) o.construction_year = Math.round(o.construction_year);
      return [o, { ...extra, radiatorCount: pick(extra.radiatorCount, k) != null ? Math.round(pick(extra.radiatorCount, k)) : null }];
    };
    const mid = assess(...build('mid'));
    if (!uncertain.length) return { ...mid, uncertain, range: { lo: mid.load.lo, hi: mid.load.hi, today: mid.cost && [mid.cost.today, mid.cost.today], hp: mid.cost && [mid.cost.hp.lo, mid.cost.hp.hi] } };
    const lo = assess(...build('lo')), hi = assess(...build('hi'));
    const all = [lo, mid, hi];
    const loads = all.filter((r) => r.load.best != null);
    const range = {
      lo: loads.length ? Math.min(...loads.map((r) => r.load.lo)) : null,
      hi: loads.length ? Math.max(...loads.map((r) => r.load.hi)) : null,
    };
    const costs = all.map((r) => r.cost).filter(Boolean);
    if (costs.length) {
      const t = costs.map((c) => c.today).filter((x) => x != null);
      range.today = t.length ? [Math.min(...t), Math.max(...t)] : null;
      range.hp = [Math.min(...costs.map((c) => c.hp.lo)), Math.max(...costs.map((c) => c.hp.hi))];
    }
    const out = { ...mid, uncertain, range, scenarios: { lo, mid, hi } };
    const verdicts = new Set(all.map((r) => r.verdict));
    if (verdicts.size > 1) {
      out.findings = [...mid.findings, { status: 'check', area: 'Your answers', title: 'Result depends on details we don\'t know yet', text: `With the lower values the result is ${lo.verdict}, with the higher values ${hi.verdict}. A look at your bill, a photo or a quick visit settles it.` }];
      if (mid.verdict === 'green') { out.verdict = 'yellow'; out.headline = 'Probably workable — a few things need checking'; }
    }
    return out;
  }

  // ---- 7. Company view: is this lead worth a visit, and is it profitable? ----------
  const DEFAULT_PRICES = {
    hpFixed: 14000, hpPerKw: 1300, radiator: 900, balancingFixed: 1200, balancingPerRad: 60, singlePipe: 6000, margin: 0.20,
  };
  const SIZES = [5, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30];

  function lead(r, ctx = {}, prices = DEFAULT_PRICES) {
    const P = { ...DEFAULT_PRICES, ...prices };
    const L = r.load, D = r.dist;
    const loadHi = r.range && r.range.hi != null ? r.range.hi : L.hi;
    const best = L.best;
    const sizeKw = best != null ? (SIZES.find((s) => s >= best) || 30) : null;
    const pipe = r.input.pipe_system;
    const count = D.perRadiator ? D.perRadiator.count : null;

    // extra work
    const extras = [];
    if (D.dist !== 'underfloor' && count) {
      let share = 0;
      const lvl = D.perRadiator && D.perRadiator.level;
      const old = (r.input.construction_year || 0) < 1995;
      if (lvl === 'too-large') share = 0.6; else if (lvl === 'large') share = 0.3; else if (lvl === 'typical' && old) share = 0.15;
      if (pipe === 'single-pipe') share = Math.max(share, 0.25);
      const n = Math.round(count * share);
      if (n > 0) extras.push({ key: 'radiators', label: `Replace ~${n} of ${count} radiators with larger ones`, cost: n * P.radiator });
      extras.push({ key: 'balancing', label: `Hydraulic balancing${r.facts.valvesToReplace ? ` + ${r.facts.valvesToReplace} new valves` : ''}`, cost: P.balancingFixed + P.balancingPerRad * count });
    }
    if (pipe === 'single-pipe') extras.push({ key: 'singlepipe', label: 'Single-pipe loop: partial conversion or bypass adjustment', cost: P.singlePipe });
    const insulationHint = L.wm2Hi > A.insulationHintWm2;

    const hpCost = sizeKw ? P.hpFixed + P.hpPerKw * sizeKw : null;
    const value = hpCost != null ? hpCost + extras.reduce((s, e) => s + e.cost, 0) : null;
    const marginEur = value != null ? value * P.margin : null;

    // complexity
    const cx = [];
    if (pipe === 'single-pipe') cx.push('single-pipe system');
    if (extras.some((e) => e.key === 'radiators' && e.cost >= 3 * P.radiator)) cx.push('several radiators to replace');
    if (L.wm2Hi > 120) cx.push('very high heating load');
    if (D.dist === 'mixed') cx.push('two heating circuits');
    if (r.findings.some((f) => f.area === 'Data' && f.status !== 'ok' && /add up/.test(f.title))) cx.push('contradictory data');
    if (pipe === 'unknown' && (r.input.construction_year || 2000) < 1980) cx.push('pipe system unknown in an older house');
    const complexity = cx.length <= 1 ? 'Low' : cx.length <= 3 ? 'Medium' : 'High';

    let profit;
    if (marginEur == null) profit = 'Unknown';
    else if (marginEur >= 6000 && complexity !== 'High') profit = 'Good';
    else if (marginEur >= 4000) profit = 'Moderate';
    else profit = 'Low';

    // customer savings (their motivation to buy)
    const today = r.range && r.range.today ? (r.range.today[0] + r.range.today[1]) / 2 : r.cost && r.cost.today;
    const hp = r.range && r.range.hp ? (r.range.hp[0] + r.range.hp[1]) / 2 : r.cost && (r.cost.hp.lo + r.cost.hp.hi) / 2;
    const savings = today != null && hp != null ? today - hp : null;

    // data confidence
    const known = ctx.known ?? 0, unsure = ctx.unsure ?? r.uncertain?.length ?? 0, photos = ctx.photos ?? 0;
    const conf = Math.max(0, Math.min(1, (known + photos * 1.5) / Math.max(1, known + unsure + photos * 1.5)));
    const contradictions = r.findings.filter((f) => /add up/.test(f.title)).length;

    // visit-worthiness score
    let score = { green: 40, yellow: 25, red: r.missing.length >= 2 ? 10 : 5 }[r.verdict];
    const why = [];
    why.push({ green: '+ Likely suitable', yellow: '± Workable, open points', red: '− Obstacle or too little data' }[r.verdict]);
    if (savings != null) {
      if (savings > 1500) { score += 20; why.push(`+ High savings for the customer (~€${Math.round(savings).toLocaleString('en')}/yr)`); }
      else if (savings > 700) { score += 12; why.push(`+ Solid savings (~€${Math.round(savings).toLocaleString('en')}/yr)`); }
      else if (savings > 300) { score += 5; why.push(`± Modest savings (~€${Math.round(savings).toLocaleString('en')}/yr)`); }
      else why.push('− Little to save — weak buying motive');
    }
    score += Math.round(conf * 20);
    why.push(`${conf >= 0.7 ? '+' : conf >= 0.4 ? '±' : '−'} Data confidence ${Math.round(conf * 100)} %`);
    if (contradictions) { score -= 10 * Math.min(2, contradictions); why.push('− Data contradicts itself — clarify before driving out'); }
    if (ctx.contact) { score += 10; why.push('+ Customer asked for a call'); }
    if (ctx.path === 'savings') { score += 10; why.push('+ Customer went through the detailed check'); }
    if (complexity === 'High') { score -= 5; why.push('− Complex job'); }
    score = Math.max(0, Math.min(100, score));
    const decision = score >= 65 ? 'Book a visit' : score >= 40 ? 'Call first to clarify' : 'Not now — keep in touch';

    // phone questions before the visit
    const ask = [];
    if (r.uncertain && r.uncertain.includes('annual_consumption_kwh')) ask.push('Ask for last year\'s bill: exact kWh or litres');
    if (r.input.annual_consumption_kwh == null) ask.push('Ask for the yearly consumption (bill or meter readings)');
    if (r.uncertain && r.uncertain.includes('floor_area_m2')) ask.push('Confirm the heated living area');
    if (pipe === 'unknown' && D.dist !== 'underfloor') ask.push('Ask: does one pipe run along the wall from radiator to radiator?');
    if (!r.dist.findings.some((f) => /Type \d\d/.test(f.title)) && D.dist !== 'underfloor') ask.push('Ask for a photo of a radiator from the side (number of panels)');
    if (r.facts.extraHeatSource) ask.push('Ask how much the wood stove is used — the heat pump must cover the full load');
    if (contradictions) ask.push('Clarify the contradiction in the data (see findings)');
    if (r.facts.unheatedArea) ask.push('Ask whether the unused rooms will be heated later');
    ask.push('Ask about the electricity meter cabinet (age, free space)');

    const checklist = [
      'Room-by-room heating load (DIN EN 12831)',
      'Electrical connection and meter cabinet',
      'Outdoor unit location: space, noise distance, pipe route',
    ];
    if (D.dist !== 'underfloor') checklist.push('Measure radiators in the coldest rooms (type, size)');
    if (pipe !== 'two-pipe' && D.dist !== 'underfloor') checklist.push('Confirm the pipe system (single- or two-pipe)');
    if (extras.some((e) => e.key === 'balancing')) checklist.push('Valves and hydraulic balancing');
    checklist.push('Space for hot-water and buffer tank');
    checklist.push('Sound limits and permits for the outdoor unit');
    if (insulationHint) checklist.push('Note insulation potential (walls, roof, windows)');

    return { sizeKw, extras, hpCost, value, marginEur, complexity, cx, profit, savings, conf, score, decision, why, ask, checklist, insulationHint, prices: P };
  }

  root.HPEngine = { assess, assessRange, lead, readFreeText, A, BANDS, DEFAULT_PRICES };
  if (typeof module !== 'undefined') module.exports = root.HPEngine;
})(typeof window !== 'undefined' ? window : globalThis);
