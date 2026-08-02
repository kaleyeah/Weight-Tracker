#!/usr/bin/env node
/* J4 — the COMPLETE race matrix required by design v9.1 §8.2:
   steal‖write, steal‖steal, renew‖steal, release‖write,
   expiry-acquire‖write — 100 iterations each, launch order alternated
   (barrier both ways), oracle = committed state + ledger fence evidence
   (+ the txhold serialization barrier run once per mode). Timing is
   supporting evidence only (I10).
   Usage: node run-races.mjs [--base URL] [--mode off|enforce] */
import crypto from "node:crypto";
import fs from "node:fs";

const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://127.0.0.1:8098";
const MODE = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "off";
const SU = { identity: "probe@local.test", password: "probe-password-1" };
const N = 100;

async function api(p, opts = {}, t) {
  const headers = { "Content-Type": "application/json" };
  if (t) headers.Authorization = t;
  const r = await fetch(BASE + p, { ...opts, headers });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}
const post = (p, b, t) => api(p, { method: "POST", body: JSON.stringify(b) }, t);
const key = () => "rc-" + crypto.randomBytes(20).toString("hex");
const jittered = (fn, ms) => new Promise((res) => setTimeout(() => res(fn()), ms));

(async () => {
  const su = (await post("/api/collections/_superusers/auth-with-password", SU)).body.token;
  const pw = "disposable-pw-123";
  const email = `races-${crypto.randomBytes(4).toString("hex")}@disposable.test`;
  const uid = (await post("/api/collections/users/records", { email, password: pw, passwordConfirm: pw }, su)).body.id;
  const tok = (await post("/api/collections/users/auth-with-password", { identity: email, password: pw })).body.token;
  const lease = (op, extra) => post("/api/cf/writer/lease", { op, ...extra }, tok);
  const commit = (b) => post("/api/cf/appdata/commit", b, tok);
  const ledgerHas = async (k) => {
    const r = await api("/api/collections/cf_commit_log/records?filter=" +
      encodeURIComponent(`user="${uid}" && key="${k}"`), {}, su);
    return (r.body?.items || [])[0] || null;
  };
  const status = () => lease("status", {});
  const coreState = async () => {
    const r = await api("/api/collections/appdata/records?filter=" +
      encodeURIComponent(`user="${uid}"`), {}, su);
    const it = (r.body?.items || [])[0] || {};
    return { rev: it.coreRev, data: it.data };
  };
  /* typed-rejection check (round-11 item 5): a rejected write must be the
     exact contract shape — 409 + fenceStale:true + the authoritative
     post-transition fence. Anything else is an anomaly. */
  const typedStale = (cR, authorityFence) =>
    cR.status === 409 && cR.body && cR.body.fenceStale === true && cR.body.fence === authorityFence;

  // seed: appdata row at rev 1, devA holds the pen
  let acq = await lease("acquire", { deviceId: "devA", deviceName: "A" });
  let fence = acq.body.fence, holder = "devA", rev = 0;
  const c0 = await commit({ subsystem: "core", expectedRev: 0, idempotencyKey: key(),
    payload: { seed: 1 }, fence, deviceId: holder });
  rev = c0.body.newRev;

  const pairs = {};
  const anomalies = [];
  let lastFenceSeen = fence;
  const noteFence = (f, where, i) => {
    if (typeof f !== "number") return;
    if (f < lastFenceSeen) anomalies.push({ where, i, nonMonotonicFence: [lastFenceSeen, f] });
    lastFenceSeen = Math.max(lastFenceSeen, f);
  };

  /* --- txhold serialization barrier (once) --- */
  {
    const holdP = post("/api/probe/txhold", { ms: 700 }, tok);
    await new Promise((r) => setTimeout(r, 120));
    const t0 = Date.now();
    const st = await lease("steal", { deviceId: "devB", deviceName: "B" });
    const blockedMs = Date.now() - t0;
    await holdP;
    pairs.txholdBarrier = { blockedMs, pass: st.status === 200 && blockedMs > 400 };
    fence = st.body.fence; holder = "devB"; noteFence(fence, "txhold", 0);
  }

  /* --- steal ‖ write --- */
  {
    let commitFirst = 0, stealFirst = 0;
    for (let i = 0; i < N; i++) {
      const newDev = holder === "devA" ? "devB" : "devA";
      const k = key(); const bias = i % 2 ? 20 : 0;
      const [cR, sR] = await Promise.all([
        jittered(() => commit({ subsystem: "core", expectedRev: rev, idempotencyKey: k,
          payload: { i }, fence, deviceId: holder }), bias),
        jittered(() => lease("steal", { deviceId: newDev, deviceName: "x" }), 20 - bias)]);
      const row = await ledgerHas(k);
      const landed = cR.status === 200;
      if (landed !== !!row) anomalies.push({ pair: "steal-write", i, oracleMismatch: { landed, row: !!row } });
      if (landed) { rev = cR.body.newRev; commitFirst++;
        if (MODE === "enforce" && row.writerFence !== fence)
          anomalies.push({ pair: "steal-write", i, fenceEvidence: [row.writerFence, fence] });
        const cs = await coreState();
        if (cs.rev !== rev || cs.data?.i !== i)
          anomalies.push({ pair: "steal-write", i, winnerIdentity: { rev: cs.rev, expected: rev, marker: cs.data?.i } });
      } else if (MODE === "enforce" && typedStale(cR, sR.body.fence)) { stealFirst++;
        const cs = await coreState();
        if (cs.rev !== rev) anomalies.push({ pair: "steal-write", i, mutatedDespiteStale: cs.rev });
      } else anomalies.push({ pair: "steal-write", i, unexpected: { status: cR.status, body: cR.body } });
      noteFence(sR.body.fence, "steal-write", i);
      fence = sR.body.fence; holder = newDev;
    }
    pairs.stealWrite = { N, commitFirst, stealFirst,
      pass: MODE === "enforce" ? (commitFirst > 5 && stealFirst > 5) : commitFirst === N };
  }

  /* --- steal ‖ steal --- */
  {
    let distinct = 0;
    for (let i = 0; i < N; i++) {
      const bias = i % 2 ? 15 : 0;
      const [s1, s2] = await Promise.all([
        jittered(() => lease("steal", { deviceId: "devA", deviceName: "a" }), bias),
        jittered(() => lease("steal", { deviceId: "devB", deviceName: "b" }), 15 - bias)]);
      if (s1.status !== 200 || s2.status !== 200) { anomalies.push({ pair: "steal-steal", i, s1: s1.status, s2: s2.status }); continue; }
      if (s1.body.fence === s2.body.fence) anomalies.push({ pair: "steal-steal", i, sameFence: s1.body.fence });
      else distinct++;
      const hi = Math.max(s1.body.fence, s2.body.fence);
      const hiDev = s1.body.fence > s2.body.fence ? "devA" : "devB";
      noteFence(hi, "steal-steal", i);
      const st = await status();
      if (st.body.fence !== hi) anomalies.push({ pair: "steal-steal", i, finalFence: [st.body.fence, hi] });
      if (st.body.holderDeviceId !== hiDev)
        anomalies.push({ pair: "steal-steal", i, finalHolder: [st.body.holderDeviceId, hiDev] });
      fence = st.body.fence; holder = st.body.holderDeviceId;
    }
    pairs.stealSteal = { N, distinct, pass: distinct === N };
  }

  /* --- renew ‖ steal --- */
  {
    let renewWon = 0, renewStaled = 0;
    for (let i = 0; i < N; i++) {
      const newDev = holder === "devA" ? "devB" : "devA";
      const preFence = fence; const bias = i % 2 ? 15 : 0;
      const [rR, sR] = await Promise.all([
        jittered(() => lease("renew", { deviceId: holder, fence: preFence }), bias),
        jittered(() => lease("steal", { deviceId: newDev, deviceName: "x" }), 15 - bias)]);
      if (rR.status === 200) { renewWon++;
        if (rR.body.fence !== preFence) anomalies.push({ pair: "renew-steal", i, renewChangedFence: rR.body.fence });
      } else if (rR.status === 409 && rR.body && rR.body.stale === true) renewStaled++;
      else anomalies.push({ pair: "renew-steal", i, renew: rR.status, body: rR.body });
      noteFence(sR.body.fence, "renew-steal", i);
      fence = sR.body.fence; holder = newDev;
    }
    pairs.renewSteal = { N, renewWon, renewStaled,
      pass: renewWon + renewStaled === N && renewWon > 5 && renewStaled > 5 };
  }

  /* --- release ‖ write --- */
  {
    let writeLanded = 0, writeRejected = 0, releaseOk = 0;
    for (let i = 0; i < N; i++) {
      // holder releases while the same holder's write (same fence) races it
      const preFence = fence; const k = key(); const bias = i % 2 ? 20 : 0;
      const [relR, cR] = await Promise.all([
        jittered(() => lease("release", { deviceId: holder, fence: preFence }), bias),
        jittered(() => commit({ subsystem: "core", expectedRev: rev, idempotencyKey: k,
          payload: { rel: i }, fence: preFence, deviceId: holder }), 20 - bias)]);
      if (relR.status === 200) releaseOk++;
      else anomalies.push({ pair: "release-write", i, release: relR.status, body: relR.body });
      const row = await ledgerHas(k);
      if ((cR.status === 200) !== !!row) anomalies.push({ pair: "release-write", i, oracleMismatch: true });
      if (cR.status === 200) { rev = cR.body.newRev; writeLanded++;
        if (MODE === "enforce" && row.writerFence !== preFence)
          anomalies.push({ pair: "release-write", i, fenceEvidence: [row.writerFence, preFence] });
        const cs = await coreState();
        if (cs.rev !== rev || cs.data?.rel !== i)
          anomalies.push({ pair: "release-write", i, winnerIdentity: { rev: cs.rev, expected: rev, marker: cs.data?.rel } });
      } else if (MODE === "enforce" && typedStale(cR, relR.body.fence)) { writeRejected++;
        const cs = await coreState();
        if (cs.rev !== rev) anomalies.push({ pair: "release-write", i, mutatedDespiteStale: cs.rev });
      } else anomalies.push({ pair: "release-write", i, unexpected: cR.status, body: cR.body });
      // reacquire for the next iteration
      const newAcq = await lease("acquire", { deviceId: holder, deviceName: "x" });
      noteFence(newAcq.body.fence, "release-write", i);
      fence = newAcq.body.fence;
    }
    pairs.releaseWrite = { N, releaseOk, writeLanded, writeRejected,
      pass: releaseOk === N && (MODE === "enforce"
        ? writeLanded + writeRejected === N && writeLanded > 5 && writeRejected > 5
        : writeLanded === N) };
  }

  /* --- expiry-acquire ‖ write --- */
  {
    let writeLanded = 0, writeRejected = 0, acquireOk = 0;
    for (let i = 0; i < N; i++) {
      await post("/api/probe/age-lease", { user: uid, hours: 25 }, su);
      const newDev = holder === "devA" ? "devB" : "devA";
      const preFence = fence; const k = key(); const bias = i % 2 ? 20 : 0;
      const [aR, cR] = await Promise.all([
        jittered(() => lease("acquire", { deviceId: newDev, deviceName: "x" }), bias),
        jittered(() => commit({ subsystem: "core", expectedRev: rev, idempotencyKey: k,
          payload: { ex: i }, fence: preFence, deviceId: holder }), 20 - bias)]);
      if (aR.status === 200 && aR.body.fence > preFence) acquireOk++;
      else anomalies.push({ pair: "expiry-write", i, acquire: aR.status, fence: aR.body?.fence });
      const row = await ledgerHas(k);
      if ((cR.status === 200) !== !!row) anomalies.push({ pair: "expiry-write", i, oracleMismatch: true });
      if (cR.status === 200) { rev = cR.body.newRev; writeLanded++;
        if (MODE === "enforce" && row.writerFence !== preFence)
          anomalies.push({ pair: "expiry-write", i, fenceEvidence: [row.writerFence, preFence] });
        const cs = await coreState();
        if (cs.rev !== rev || cs.data?.ex !== i)
          anomalies.push({ pair: "expiry-write", i, winnerIdentity: { rev: cs.rev, expected: rev, marker: cs.data?.ex } });
      } else if (MODE === "enforce" && typedStale(cR, aR.body.fence)) { writeRejected++;
        const cs = await coreState();
        if (cs.rev !== rev) anomalies.push({ pair: "expiry-write", i, mutatedDespiteStale: cs.rev });
      } else anomalies.push({ pair: "expiry-write", i, unexpected: cR.status, body: cR.body });
      noteFence(aR.body?.fence, "expiry-write", i);
      fence = aR.body.fence; holder = newDev;
    }
    pairs.expiryWrite = { N, acquireOk, writeLanded, writeRejected,
      pass: acquireOk === N && (MODE === "enforce"
        ? writeLanded + writeRejected === N && writeLanded > 5 && writeRejected > 5
        : writeLanded === N) };
  }

  // cleanup with verified absence
  await api(`/api/collections/users/records/${uid}`, { method: "DELETE" }, su);
  const gone = (await api(`/api/collections/users/records/${uid}`, {}, su)).status === 404;
  const rows = (await api("/api/collections/cf_commit_log/records?filter=" +
    encodeURIComponent(`user="${uid}"`), {}, su)).body?.items || [];

  const allPass = Object.values(pairs).every((p) => p.pass) && anomalies.length === 0 && gone && rows.length === 0;
  const out = { mode: MODE, when: new Date().toISOString(), N, pairs,
    anomalyCount: anomalies.length, anomalies: anomalies.slice(0, 40),
    monotonicMaxFence: lastFenceSeen, cleanup: { userGone: gone, ledgerRows: rows.length }, allPass };
  fs.mkdirSync(new URL("../../artifacts/evidence-server/", import.meta.url), { recursive: true });
  fs.writeFileSync(new URL(`../../artifacts/evidence-server/races-${MODE}.json`, import.meta.url),
    JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ mode: MODE, pairs: Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, v.pass])),
    anomalies: anomalies.length, allPass }, null, 1));
  process.exit(allPass ? 0 : 1);
})().catch((e) => { console.error("RACES ERROR", e); process.exit(2); });
