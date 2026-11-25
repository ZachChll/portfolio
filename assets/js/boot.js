/* Chargé de façon bloquante dans le <head>, avant le premier affichage.
   Prépare les transitions entre pages (voir css/base/transitions.css) :
   - "no-vt"     : navigateur sans View Transitions → animation de secours complète
   - "vt-missed" : navigateur compatible mais la page s'affiche sans transition
                   (arrivée directe, navigateur intégré…) → simple apparition en douceur */
(function () {
  var root = document.documentElement;

  // Langue : anglais par défaut, français si le visiteur l'a choisi (voir js/modules/i18n.js).
  // En français, la page reste masquée le temps que la traduction soit posée.
  var lang = "en";
  try { if (localStorage.getItem("lang") === "fr") lang = "fr"; } catch (e) {}
  root.lang = lang;
  if (lang === "fr") {
    root.classList.add("i18n-wait");
    setTimeout(function () { root.classList.remove("i18n-wait"); }, 2000);
  }

  if (!("onpagereveal" in window)) {
    root.classList.add("no-vt");
    return;
  }
  addEventListener("pagereveal", function (e) {
    var t = e.viewTransition;
    if (!t) { root.classList.add("vt-missed"); return; }
    [t.ready, t.finished, t.updateCallbackDone].forEach(function (p) { p && p.catch(function () {}); });
  });
  // Une transition interrompue n'est pas une erreur : on évite le bruit en console
  addEventListener("pageswap", function (e) {
    var t = e.viewTransition;
    if (t) [t.ready, t.finished, t.updateCallbackDone].forEach(function (p) { p && p.catch(function () {}); });
  });
})();
