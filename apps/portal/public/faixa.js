(function () {
  var CHAVE = 'becogames.cookies';
  var faixa = globalThis.document.getElementById('faixa-cookies');
  if (!faixa) return;
  function jaAceito() {
    try {
      return globalThis.localStorage.getItem(CHAVE) === '1';
    } catch {
      return false;
    }
  }
  if (jaAceito()) return;
  faixa.hidden = false;
  faixa.querySelector('button').addEventListener('click', function () {
    try {
      globalThis.localStorage.setItem(CHAVE, '1');
    } catch {
      /* sem armazenamento: a faixa some só nesta visita */
    }
    faixa.hidden = true;
  });
})();
