(function () {
  var w = globalThis;
  var doc = w.document;
  var CHAVE = 'becogames.nome';
  var ESPERA_MS = 1500;
  var PAGINAS_DE_CONTA = { 'minha-conta': 1, entrar: 1, 'criar-conta': 1 };

  function lerGuardado() {
    try {
      return w.sessionStorage.getItem(CHAVE) || '';
    } catch {
      return '';
    }
  }

  function guardar(nome) {
    try {
      if (nome) w.sessionStorage.setItem(CHAVE, nome);
      else w.sessionStorage.removeItem(CHAVE);
    } catch {
      /* sem armazenamento: só não lembra */
    }
  }

  var links = doc.querySelectorAll('a.entrar');
  var seguro = false;

  function mostrarLinks() {
    links.forEach(function (a) {
      a.style.visibility = '';
    });
  }

  function pintar(nome) {
    links.forEach(function (a) {
      if (nome) {
        a.textContent = '';
        var icone = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icone.setAttribute('viewBox', '0 0 24 24');
        icone.setAttribute('width', '16');
        icone.setAttribute('height', '16');
        icone.setAttribute('aria-hidden', 'true');
        icone.setAttribute('fill', 'none');
        icone.setAttribute('stroke', 'currentColor');
        icone.setAttribute('stroke-width', '1.8');
        icone.setAttribute('stroke-linecap', 'round');
        var cab = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cab.setAttribute('cx', '12');
        cab.setAttribute('cy', '8');
        cab.setAttribute('r', '3.5');
        var corpo = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        corpo.setAttribute('d', 'M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6');
        icone.appendChild(cab);
        icone.appendChild(corpo);
        var texto = doc.createElement('span');
        texto.textContent = nome;
        a.appendChild(icone);
        a.appendChild(texto);
        a.setAttribute('href', '/minha-conta');
        a.setAttribute('aria-label', 'Minha conta: ' + nome);
        a.classList.add('logado');
      } else {
        a.textContent = 'Entrar';
        a.setAttribute('href', '/entrar');
        a.removeAttribute('aria-label');
        a.classList.remove('logado');
      }
    });
  }

  /** Confirma o estado: nome (logado) ou null (sem sessão). Também usado pelo conta.js. */
  function definir(nome) {
    seguro = true;
    guardar(nome || '');
    pintar(nome || '');
    mostrarLinks();
  }

  w.BecoSessao = { definir: definir };

  var guardado = lerGuardado();
  if (guardado) pintar(guardado);
  else
    links.forEach(function (a) {
      a.style.visibility = 'hidden';
    });
  w.setTimeout(function () {
    if (!seguro) mostrarLinks();
  }, ESPERA_MS);

  // nas telas de conta o conta.js já chama o `eu` e entrega o resultado aqui
  if (PAGINAS_DE_CONTA[doc.body.getAttribute('data-pagina')]) return;

  w.fetch('/api/conta/eu', { credentials: 'same-origin' })
    .then(function (r) {
      if (r.status === 200)
        return r.json().then(function (c) {
          definir(c && c.conta && typeof c.conta.nome === 'string' ? c.conta.nome : null);
        });
      if (r.status === 401) return definir(null);
      mostrarLinks();
    })
    .catch(mostrarLinks);
})();
