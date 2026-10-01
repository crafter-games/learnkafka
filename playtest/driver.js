// Autoplays a level: answers predictions/checks with the known answers and solves tasks via the dock.
(async () => {
  const T = () => window.__TEST__;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stop = window.__STOP;
  const btn = (re) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent.trim()) && !b.disabled);
  const NEXT = /^(Next|Start the recall check|Siguiente|Empezar el repaso)/;
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
  for (let g = 0; g < 400 && T().phase() !== "result"; g++) {
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
    const next = btn(NEXT);
    if (next) {
      log.push(s.kind);
      next.click();
      await sleep(600);
      continue;
    }
    if (s.kind === "predict" && !document.querySelector("[role=status]")) {
      await answer(T().prediction());
      await sleep(2700);
      continue;
    }
    if (s.kind === "task") {
      if (btn(/→ orders/)) {
        btn(/New order|Nuevo pedido/.test(document.body.innerText) ? /→ orders/ : /→ payments/).click();
        await sleep(450);
        continue;
      }
      const dock = [...document.querySelectorAll("footer button")].filter((b) => !b.disabled && b.type !== "submit");
      if (dock.length) dock[g % dock.length].click();
      await sleep(700);
      continue;
    }
    await sleep(500);
  }
  return { phase: T().phase(), log };
})()
