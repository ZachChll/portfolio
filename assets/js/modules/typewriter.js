/**
 * Effet "machine à écrire" sur un titre, avec un curseur _ qui clignote.
 * Le texte complet reste dans le HTML (lisible sans JS et par les lecteurs d'écran).
 */
export function initTypewriter(el, { speed = 55, linePause = 350 } = {}) {
  const lines = [...el.querySelectorAll(".hero__line")];
  if (!lines.length) return;

  el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  lines.forEach((l) => l.setAttribute("aria-hidden", "true"));

  const caret = document.createElement("span");
  caret.className = "caret";
  caret.textContent = "_";
  caret.setAttribute("aria-hidden", "true");

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    lines.at(-1).append(caret);
    return;
  }

  // On mémorise chaque nœud texte et on le vide
  const queue = lines.map((line) => {
    const nodes = [];
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push({ node: walker.currentNode, text: walker.currentNode.data });
    nodes.forEach((n) => (n.node.data = ""));
    return { line, nodes };
  });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  (async () => {
    await wait(300);
    for (const { line, nodes } of queue) {
      line.append(caret);
      for (const n of nodes) {
        for (const ch of n.text) {
          n.node.data += ch;
          await wait(ch === " " ? speed / 2 : speed);
        }
      }
      await wait(linePause);
    }
  })();
}
