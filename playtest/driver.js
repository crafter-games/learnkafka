// Autoplays a level: answers predictions/checks with the known answers and solves tasks via the dock.
(async () => {
  const T = () => window.__TEST__;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stop = window.__STOP;
  const btn = (re) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent.trim()) && !b.disabled);
  const NEXT = /^(Next|Start the recall check|Let's go!|Siguiente|Empezar el repaso|¡A jugar!)/;
  const answer = async (q) => {
    if (q.input === "number") {
      const i = document.querySelector("#answer-number");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, String(q.answer));
      i.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(80);
      i.form.requestSubmit();
    } else document.querySelector(`[data-value="${q.answer}"]`).click();
  };
  const log = [];
  const deadline = Date.now() + 170000;
  for (let g = 0; g < 400 && T().phase() !== "result" && Date.now() < deadline; g++) {
    if (stop !== undefined && T().phase() === "steps" && T().step().index === stop) return { stopped: stop, log };
    if (T().phase() === "check") {
      if (!document.querySelector("[role=status]")) {
        await answer(T().question());
        await sleep(300);
      }
      const n = btn(/^(Next|See results|Siguiente|Ver resultados)/);
      if (n) n.click();
      await sleep(400);
      continue;
    }
    const s = T().step();
    if (s.kind === "predict" && document.querySelector("[data-value]:not([disabled]), #answer-number:not([disabled])")) {
      await answer(T().prediction());
      await sleep(2700);
      continue;
    }
    // Dialogue box: finish typing / turn the page until its last page shows a button
    const dlg = document.querySelector("[data-dialogue]");
    if (dlg && (dlg.dataset.dialogue === "more" || !dlg.querySelector("button"))) {
      dlg.click();
      await sleep(150);
      continue;
    }
    const next = btn(NEXT);
    if (next) {
      log.push(s.kind);
      next.click();
      await sleep(600);
      continue;
    }
    if (s.kind === "task") {
      // Settings first: pick the "right" option for each dial if it isn't selected yet
      const want = ["acks=all", "idempotent=true", "codec=zstd", "batchSize=4", "lingerMs=1000", "maxPollRecords=5", "protocol=cooperative", "commit=after", "minInsync=2", "retainSegments=2", "grace=5", "groupType=share", "onFailure=reject", "sequential=true", "batch=100", "zeroCopy=true", "quota=20"];
      if (/TLS/.test(document.querySelector("[data-objective]")?.textContent || "")) want.unshift("tls=true");
      const setting = want.map((w) => document.querySelector(`[data-setting="${w}"]`)).find((b) => b && b.getAttribute("aria-checked") !== "true");
      if (setting) {
        setting.click();
        await sleep(400);
        continue;
      }
      // Only crash once a few receipts are acknowledged
      const crash = btn(/Crash the leader|Tumbar al líder/);
      const acked = (document.body.innerText.match(/#\d+ ✓/g) || []).length;
      if (crash && acked >= 5) {
        crash.click();
        await sleep(2500);
        continue;
      }
      // World 6: transactions — begin, send, then abort (abort task) or commit after a pause
      const txnBegin = document.querySelector('[data-txn="begin"]');
      if (txnBegin) {
        const wantAbort = /abort|abortar/i.test(document.querySelector("[data-objective]")?.textContent || "");
        if (!txnBegin.disabled) {
          txnBegin.click();
          await sleep(400);
          document.querySelector('[data-txn="send"]')?.click();
          await sleep(2200);
          document.querySelector(`[data-txn="${wantAbort ? "abort" : "commit"}"]`)?.click();
          await sleep(2500);
        } else await sleep(500);
        continue;
      }
      // World 5: careful broker handling
      window.__w5 = window.__w5 || {};
      const k = `${s.index}`;
      const ctrl = btn(/Crash the active controller|Tumbar al controlador activo/);
      if (ctrl && !window.__w5["ctrl" + k]) {
        ctrl.click();
        window.__w5["ctrl" + k] = true;
        await sleep(1500);
        continue;
      }
      const slow3 = document.querySelector('[data-broker="slow:broker-3"]');
      if (slow3 && !window.__w5["fixed" + k]) {
        if (slow3.getAttribute("aria-pressed") !== "true") {
          slow3.click();
          await sleep(5000);
        } else {
          slow3.click();
          window.__w5["fixed" + k] = true;
          await sleep(4000);
        }
        continue;
      }
      const crash1 = document.querySelector('[data-broker="crash:broker-1"]');
      const ackedNow = (document.body.innerText.match(/#\d+ ✓/g) || []).length;
      if (crash1 && /\/(5-1|5-4)$/.test(location.pathname) && (ctrl === undefined || window.__w5["ctrl" + k]) && (ackedNow >= 2 || window.__w5["ctrl" + k]) && !window.__w5["c1" + k]) {
        await sleep(1500);
        crash1.click();
        window.__w5["c1" + k] = true;
        await sleep(2500);
        continue;
      }
      // World 8: crash the connector between flushes, then restart; crash and restore the Streams app
      window.__w8 = window.__w8 || {};
      const act = (id) => document.querySelector(`[data-action="${id}"]:not([disabled])`);
      if (act("connectorCrash") && !window.__w8.conn) {
        for (let i = 0; i < 3; i++) {
          act("dbInsert")?.click();
          await sleep(200);
        }
        await sleep(1300);
        act("connectorCrash")?.click();
        window.__w8.conn = true;
        await sleep(800);
        continue;
      }
      if (act("connectorRestart")) {
        act("connectorRestart").click();
        await sleep(1500);
        continue;
      }
      if (window.__w8.conn && act("dbInsert")) {
        await sleep(600); // let the connector catch up
        continue;
      }
      if (act("appCrash") && !window.__w8.app) {
        act("appCrash").click();
        window.__w8.app = true;
        await sleep(800);
        continue;
      }
      if (act("appRestart")) {
        act("appRestart").click();
        await sleep(2500);
        continue;
      }
      // Consumer groups: crash a robot, rehire, and crash again every ~8 s until the task counts it
      window.__crashed = window.__crashed || {};
      const robotCrash = btn(/Crash a robot|Tumbar un robot/);
      if (robotCrash && Date.now() - (window.__crashed[s.index] || 0) > 8000) {
        await sleep(2500);
        btn(/Crash a robot|Tumbar un robot/)?.click();
        window.__crashed[s.index] = Date.now();
        await sleep(1200);
        continue;
      }
      if (btn(/→ orders/)) {
        btn(/New order|Nuevo pedido/.test(document.body.innerText) ? /→ orders/ : /→ payments/).click();
        await sleep(450);
        continue;
      }
      const dock = [...document.querySelectorAll("[data-dock] button")].filter((b) => !b.disabled && b.type !== "submit" && !b.dataset.setting && !/Crash|Tumbar/.test(b.textContent) && !/^(crash|slow):/.test(b.dataset.broker || "") && !(/^revive:/.test(b.dataset.broker || "") && !/#\d+ ⊘/.test(document.body.innerText)) && !(b.dataset.tombstone && document.body.innerText.includes(" ∅")));
      if (!dock.length) {
        await sleep(600);
        continue;
      }
      if (dock.length) dock[g % dock.length].click();
      await sleep(700);
      continue;
    }
    await sleep(500);
  }
  return { phase: T().phase(), log };
})()
