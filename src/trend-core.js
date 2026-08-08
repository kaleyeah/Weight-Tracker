/* ==================== MEASUREMENT TREND CORE (Owner package 2026-08-06)
   Pure period/aggregation/copy/SVG logic for the W / M / 6M measurement trend
   component. NO state, NO DOM, NO persistence — the view layer passes plain
   observation arrays ({date:"YYYY-MM-DD", value:Number}) built from the
   app's canonical stores, and gets back numbers and an SVG string.

   Period semantics are the PACKAGE'S, deliberately different from the page
   trendCtx() calendar windows (which continue to drive steps/calories/sleep/
   training history, untouched):
     W  — 7 consecutive local dates ending on the selected end date
     M  — 30 consecutive local dates ending on the selected end date
     6M — a rolling six-CALENDAR-month window ending on the selected end date
   "Previous" moves back exactly one matching period.

   Canonical rules honored here: one observation per date (enforced by every
   writer in the app), no zero-fill, no interpolation, no fabricated points;
   LBM derives per paired same-date observation, never from averaged inputs.

   UMD: classic-script globals in the app; module.exports for node tests. */

function tcDaysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
function tcParse(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function tcISO(d) {
  var m = d.getMonth() + 1, dd = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
}
function tcAddDays(iso, n) { var d = tcParse(iso); d.setDate(d.getDate() + n); return tcISO(d); }
/* calendar-month arithmetic with day clamping: Aug 31 − 6mo → Feb 28/29 */
function tcAddMonths(iso, n) {
  var d = tcParse(iso), y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate();
  var ny = y + Math.floor(m / 12), nm = ((m % 12) + 12) % 12;
  return tcISO(new Date(ny, nm, Math.min(day, tcDaysIn(ny, nm))));
}
var TC_MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var TC_DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function tcFmt(iso) { var d = tcParse(iso); return TC_MON[d.getMonth()] + " " + d.getDate(); }

/* {startISO,endISO,prevStartISO,prevEndISO,label} for mode at offset periods
   back from todayISO. Offset 0 ends on today; navigation never goes forward
   of offset 0 (the view enforces the disabled Next). */
function tcPeriod(mode, offset, todayISO) {
  var end, start, pEnd, pStart;
  if (mode === "6M") {
    end = tcAddMonths(todayISO, -6 * offset);
    start = tcAddDays(tcAddMonths(end, -6), 1);
    pEnd = tcAddDays(start, -1);
    pStart = tcAddDays(tcAddMonths(pEnd, -6), 1);
  } else {
    var len = mode === "W" ? 7 : 30;
    end = tcAddDays(todayISO, -len * offset);
    start = tcAddDays(end, -(len - 1));
    pEnd = tcAddDays(start, -1);
    pStart = tcAddDays(pEnd, -(len - 1));
  }
  var sd = tcParse(start), ed = tcParse(end);
  var label = tcFmt(start) + " – " + tcFmt(end) +
    (sd.getFullYear() === ed.getFullYear() ? ", " + String(ed.getFullYear()).slice(2)
      : " " + String(ed.getFullYear()).slice(2));
  return { startISO: start, endISO: end, prevStartISO: pStart, prevEndISO: pEnd, label: label };
}

/* observations in [start..end], sorted; input values must already be numbers.
   Nothing is invented for missing dates. */
function tcWindow(obs, startISO, endISO) {
  var pts = [];
  for (var i = 0; i < obs.length; i++) {
    var o = obs[i];
    if (o && o.date >= startISO && o.date <= endISO &&
        typeof o.value === "number" && isFinite(o.value)) pts.push(o);
  }
  pts.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var sum = 0;
  for (var j = 0; j < pts.length; j++) sum += pts[j].value;
  return { points: pts, count: pts.length, avg: pts.length ? sum / pts.length : null };
}

/* LBM per paired same-date observation: stored LBM wins for its date; else
   weight×(1−bf/100) when BOTH exist for that exact date. Never average-of-
   averages, never a pairing tolerance. */
function tcLbmObs(weightObs, bfObs, storedLbmObs) {
  var byDate = {}, i;
  var bf = {}; for (i = 0; i < bfObs.length; i++) bf[bfObs[i].date] = bfObs[i].value;
  for (i = 0; i < weightObs.length; i++) {
    var w = weightObs[i], b = bf[w.date];
    if (typeof b === "number" && isFinite(b) && b > 0 && b < 100 &&
        typeof w.value === "number" && isFinite(w.value))
      byDate[w.date] = { date: w.date, value: w.value * (1 - b / 100), derived: true };
  }
  for (i = 0; i < storedLbmObs.length; i++) {
    var s = storedLbmObs[i];
    if (typeof s.value === "number" && isFinite(s.value)) byDate[s.date] = { date: s.date, value: s.value };
  }
  var out = [];
  for (var d in byDate) out.push(byDate[d]);
  out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return out;
}

/* calendar-month buckets for 6M, clipped to [start..end]; empty months get
   NO bucket (never a fabricated segment) */
function tcMonthBuckets(obs, startISO, endISO) {
  var win = tcWindow(obs, startISO, endISO).points, seen = {}, order = [];
  for (var i = 0; i < win.length; i++) {
    var k = win[i].date.slice(0, 7);
    if (!seen[k]) { seen[k] = { key: k, label: TC_MON[+win[i].date.slice(5, 7) - 1], points: [] }; order.push(k); }
    seen[k].points.push(win[i]);
  }
  return order.map(function (k) {
    var b = seen[k], sum = 0;
    b.points.forEach(function (p) { sum += p.value; });
    return { key: k, label: b.label, count: b.points.length, avg: sum / b.points.length,
      firstISO: b.points[0].date, lastISO: b.points[b.points.length - 1].date };
  });
}

/* Comparison + copy. A strong comparison claim needs BOTH windows to carry
   minCount observations (the PACE_MIN_WEIGHINS discipline: below it the copy
   must not sound confident). The view passes minCount = 3 for W, 7 for M/6M
   — a stated product default, flagged in the handoff. */
function tcCompare(cur, prev, minCount) {
  if (!cur.count) return { kind: "empty" };
  if (!prev.count) return { kind: "no-prior" };
  if (cur.count < minCount || prev.count < minCount) return { kind: "insufficient" };
  var d = cur.avg - prev.avg;
  return { kind: "ok", delta: d, pct: prev.avg !== 0 ? (d / Math.abs(prev.avg)) * 100 : null };
}
function tcRound(v, dec) { var p = Math.pow(10, dec); return Math.round(v * p) / p; }
function tcNum(v, dec) {
  return tcRound(v, dec).toFixed(dec);
}
/* cfg: {label,labelLower,unit,dec,pp} — pp=true → percentage-point wording */
function tcSummary(cfg, mode, cur, prev, cmp) {
  var per = mode === "W" ? "week" : mode === "M" ? "month" : "period";
  var prior = mode === "W" ? "previous 7-day average" : mode === "M" ? "previous 30-day average" : "previous six months";
  if (cmp.kind === "empty") return "No " + cfg.labelLower + " recorded in this " + per + ".";
  var curTxt = tcNum(cur.avg, cfg.dec) + " " + cfg.unit;
  if (mode === "6M")
    return "Your average " + cfg.labelLower + " over this period was " + curTxt +
      ". Monthly averages show how the trend changed over time.";
  if (cmp.kind === "no-prior")
    return "Your average " + cfg.labelLower + " this " + per + " was " + curTxt + ".";
  if (cmp.kind === "insufficient")
    return "Your average " + cfg.labelLower + " this " + per + " was " + curTxt +
      ". Keep recording to unlock a reliable comparison.";
  var dir = cmp.delta < 0 ? "below" : cmp.delta > 0 ? "above" : "level with";
  var s = "Your average " + cfg.labelLower + " this " + per + " (" + curTxt + ") was " + dir +
    " your " + prior + " of " + tcNum(prev.avg, cfg.dec) + " " + cfg.unit + ".";
  if (cfg.pp && cmp.delta !== 0)
    s += " That is " + tcNum(Math.abs(cmp.delta), 1) + " percentage point" +
      (Math.abs(tcRound(cmp.delta, 1)) === 1 ? "" : "s") + " " + (cmp.delta < 0 ? "lower" : "higher") + ".";
  return s;
}
/* the badge under the headline: "▼ 1.1 lb vs prior month" — pct only where
   useful and never for body fat (pp metric) */
function tcBadge(cfg, mode, cmp) {
  if (cmp.kind !== "ok") return null;
  var perLbl = mode === "W" ? "prior week" : mode === "M" ? "prior month" : "prior 6 months";
  var arrow = cmp.delta < 0 ? "▼" : cmp.delta > 0 ? "▲" : "▶";
  var mag = tcNum(Math.abs(cmp.delta), cfg.dec) + (cfg.pp ? " pt" : " " + cfg.unit);
  var pct = (!cfg.pp && cfg.showPct !== false && cmp.pct != null && isFinite(cmp.pct) && Math.abs(cmp.pct) >= 0.05)
    ? " (" + tcNum(Math.abs(cmp.pct), 1) + "%)" : "";
  return { arrow: arrow, text: mag + pct + " vs. " + perLbl, dir: cmp.delta < 0 ? "down" : cmp.delta > 0 ? "up" : "flat" };
}

/* ---------- SVG ----------
   cfg: {mode,startISO,endISO,points,monthBuckets,avg,dec,unit,colors:{axis,
   grid,line,accent,fill},width?,height?,ariaLabel}
   Pure string; interactive dots carry data-act="t2:pt" for the view layer. */
function tcChartSVG(cfg) {
  var W2 = cfg.width || 340, H2 = cfg.height || 170, padL = 37, padR = 14, padT = 20, padB = 26;
  var pts = cfg.points, C = cfg.colors;
  if (!pts.length) return "";
  var xMin = tcParse(cfg.startISO).getTime(), xMax = tcParse(cfg.endISO).getTime();
  /* 6M zooms to the DATA (Owner, 2026-08-06: a short history crammed into the
     right sliver of a six-month axis is unreadable). When the first
     observation starts well inside the window, the axis starts just before it
     instead — the period label above the chart still names the full window. */
  if (cfg.mode === "6M" && pts.length) {
    var firstT = tcParse(pts[0].date).getTime();
    if (firstT - xMin > (xMax - xMin) * 0.25) xMin = firstT - 3 * 86400000;
  }
  if (xMin === xMax) { xMin -= 43200000; xMax += 43200000; }
  var ys = pts.map(function (p) { return p.value; });
  if (cfg.avg != null) ys.push(cfg.avg);
  (cfg.monthBuckets || []).forEach(function (b) { ys.push(b.avg); });
  var mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
  var padY = Math.max((mx - mn) * 0.18, cfg.dec >= 1 ? 0.6 : 1);
  var yMin = mn - padY, yMax = mx + padY;
  function sx(iso) { return padL + (tcParse(iso).getTime() - xMin) / (xMax - xMin) * (W2 - padL - padR); }
  function sy(v) { return (H2 - padB) - (v - yMin) / (yMax - yMin) * (H2 - padT - padB); }
  var s = '<svg class="wl-chart" viewBox="0 0 ' + W2 + " " + H2 + '" xmlns="http://www.w3.org/2000/svg" style="height:' + H2 + 'px" role="img" aria-label="' + cfg.ariaLabel + '">';
  /* y grid: 4 divisions = 5 tick labels ≥ the required 3 */
  for (var i = 0; i <= 4; i++) {
    var yv = yMin + (yMax - yMin) * i / 4, y = sy(yv);
    s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W2 - padR) + '" y2="' + y + '" stroke="' + C.grid + '" stroke-dasharray="2 4"/>';
    s += '<text x="' + (padL - 5) + '" y="' + (y + 3) + '" fill="' + C.axis + '" font-size="9" text-anchor="end">' + tcNum(yv, cfg.dec >= 1 && (yMax - yMin) < 8 ? 1 : 0) + "</text>";
  }
  /* DOSE MARKERS (Owner, 2026-08-08: "we could even mark them on a weight
     loss chart where we show the dose periods. Yellow lines on the day").
     Drawn after the grid and BEFORE the series, so the data line always sits
     on top. cfg.doseDays is an array of ISO dates; anything outside the
     visible window is skipped. A skipped dose is dimmer and dashed — it is
     not the same event as a dose taken. */
  (cfg.doseDays || []).forEach(function (d) {
    var iso = d.date || d, t = tcParse(iso).getTime();
    if (!(t >= xMin && t <= xMax)) return;
    var x = sx(iso);
    s += '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (H2 - padB) +
      '" stroke="' + (C.dose || "#F5B544") + '" stroke-width="1.2" opacity="' +
      (d.skipped ? 0.35 : 0.75) + '"' + (d.skipped ? ' stroke-dasharray="3 3"' : "") + '/>';
  });
  /* x labels */
  var xlabs = [];
  if (cfg.mode === "W") {
    pts.forEach(function (p) { var d = tcParse(p.date); xlabs.push([p.date, TC_DOW[d.getDay()] + " " + d.getDate()]); });
    if (!xlabs.length) xlabs.push([cfg.startISO, tcFmt(cfg.startISO)], [cfg.endISO, tcFmt(cfg.endISO)]);
  } else if (cfg.mode === "M") {
    for (var k = 0; k < 5; k++) xlabs.push([tcAddDays(cfg.startISO, Math.round(29 * k / 4)), null]);
    xlabs = xlabs.map(function (pr) { return [pr[0], tcFmt(pr[0])]; });
  } else {
    (cfg.monthBuckets || []).forEach(function (b) { xlabs.push([b.firstISO, b.label]); });
  }
  var lastX = -100;
  xlabs.forEach(function (pr) {
    var x = sx(pr[0]);
    if (x - lastX < 30) return; lastX = x;
    s += '<text x="' + x + '" y="' + (H2 - 8) + '" fill="' + C.axis + '" font-size="9" text-anchor="middle">' + pr[1] + "</text>";
  });
  /* M-mode dashed AVG line, label kept inside the left gutter edge */
  if (cfg.mode === "M" && cfg.avg != null) {
    var ay = sy(cfg.avg);
    s += '<line x1="' + padL + '" y1="' + ay + '" x2="' + (W2 - padR) + '" y2="' + ay + '" stroke="' + C.axis + '" stroke-width="1.1" stroke-dasharray="4 4"/>';
    /* a backed pill (the reference design's treatment) so the label stays
       readable over gridlines and never collides with the y-axis ticks */
    s += '<rect x="' + (padL + 2) + '" y="' + (ay - 13) + '" width="26" height="12" rx="3" fill="' + (C.pill || "#232634") + '"/>';
    s += '<text x="' + (padL + 15) + '" y="' + (ay - 4) + '" fill="#E8EAF2" font-size="8.5" font-weight="700" text-anchor="middle">AVG</text>';
  }
  /* the observation line: chronological, no smoothing, gaps left as drawn
     segments between REAL points only (the app's existing convention) */
  var line = "";
  pts.forEach(function (p, j) { line += (j ? "L" : "M") + sx(p.date) + " " + sy(p.value) + " "; });
  var subdued = cfg.mode === "6M";
  if (pts.length > 1) {
    if (!subdued && C.fill) {
      s += '<path d="' + line + "L" + sx(pts[pts.length - 1].date) + " " + (H2 - padB) + " L" + sx(pts[0].date) + " " + (H2 - padB) + ' Z" fill="' + C.fill + '" stroke="none"/>';
    }
    s += '<path d="' + line + '" fill="none" stroke="' + C.line + '" stroke-width="' + (subdued ? 1.1 : 2) + '"' + (subdued ? ' opacity="0.45"' : "") + ' stroke-linejoin="round" stroke-linecap="round"/>';
  }
  /* points (Owner reference, 2026-08-06): visible OPEN circles in W only —
     M and 6M show the clean line, with M ringing just its latest value.
     Every point stays tappable in every mode via the invisible hit targets. */
  var pf = C.pointFill || "#10151E";
  pts.forEach(function (p) {
    if (cfg.mode === "W")
      s += '<circle data-act="t2:pt" data-date="' + p.date + '" data-value="' + p.value + '" cx="' + sx(p.date) + '" cy="' + sy(p.value) + '" r="4" fill="' + pf + '" stroke="' + C.line + '" stroke-width="1.8"/>';
    s += '<circle data-act="t2:pt" data-date="' + p.date + '" data-value="' + p.value + '" cx="' + sx(p.date) + '" cy="' + sy(p.value) + '" r="13" fill="transparent"/>';
  });
  /* W-mode per-point value labels — always ABOVE the circles (Owner,
     2026-08-06, matching his reference) */
  if (cfg.mode === "W") {
    pts.forEach(function (p) {
      s += '<text x="' + sx(p.date) + '" y="' + (sy(p.value) - 9) + '" fill="' + C.accent + '" font-size="9" font-weight="700" text-anchor="middle">' + tcNum(p.value, cfg.dec) + "</text>";
    });
  }
  /* M-mode latest-value label */
  if (cfg.mode === "M") {
    var lp = pts[pts.length - 1], lx = sx(lp.date);
    s += '<text x="' + Math.min(lx, W2 - padR - 2) + '" y="' + (sy(lp.value) - 8) + '" fill="' + C.accent + '" font-size="10" font-weight="800" text-anchor="' + (lx > W2 - 60 ? "end" : "middle") + '">' + tcNum(lp.value, cfg.dec) + "</text>";
    s += '<circle cx="' + lx + '" cy="' + sy(lp.value) + '" r="4.5" fill="' + pf + '" stroke="' + C.accent + '" stroke-width="1.8"/>';
  }
  /* 6M month-average segments + adjacent-month deltas */
  if (cfg.mode === "6M") {
    var bks = cfg.monthBuckets || [];
    var lastLbl = null; /* {x,y} of the previous month's average label */
    bks.forEach(function (b, j) {
      var x1 = sx(b.firstISO), x2 = sx(b.lastISO), y2 = sy(b.avg);
      if (x2 - x1 < 12) { var cx = (x1 + x2) / 2; x1 = cx - 6; x2 = cx + 6; }
      var mid = (x1 + x2) / 2;
      s += '<line x1="' + x1 + '" y1="' + y2 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + C.accent + '" stroke-width="2.6" stroke-linecap="round"/>';
      /* collision avoidance (acceptance I): when adjacent month labels would
         crowd horizontally at a similar height, drop this one BELOW its
         segment instead of above */
      var ly = y2 - 6;
      if (lastLbl && Math.abs(mid - lastLbl.x) < 34 && Math.abs(ly - lastLbl.y) < 12) ly = y2 + 12;
      /* Owner, 2026-08-06: month average reads WHITE and bold */
      s += '<text x="' + mid + '" y="' + ly + '" fill="#FFFFFF" font-size="9.5" font-weight="800" text-anchor="middle">' + tcNum(b.avg, cfg.dec) + "</text>";
      lastLbl = { x: mid, y: ly };
      if (j > 0) {
        var d2 = b.avg - bks[j - 1].avg;
        var dy = (ly === y2 + 12) ? y2 + 23 : y2 + 13;
        /* Owner, 2026-08-06: the month-over-month amount reads in the SAME
           color as the average segments, not axis grey */
        if (d2 !== 0) s += '<text x="' + mid + '" y="' + dy + '" fill="#FFFFFF" font-size="9.5" font-weight="800" text-anchor="middle">' + (d2 > 0 ? "+" : "−") + tcNum(Math.abs(d2), cfg.dec) + "</text>";
      }
    });
  }
  return s + "</svg>";
}

/* node test hook (harmless in the browser: typeof module === "undefined") */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { tcPeriod: tcPeriod, tcWindow: tcWindow, tcLbmObs: tcLbmObs,
    tcMonthBuckets: tcMonthBuckets, tcCompare: tcCompare, tcSummary: tcSummary,
    tcBadge: tcBadge, tcChartSVG: tcChartSVG, tcAddMonths: tcAddMonths,
    tcAddDays: tcAddDays, tcNum: tcNum };
}
