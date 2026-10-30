(function () {
  var w = globalThis;
  var doc = w.document;
  var pagina = doc.body.getAttribute('data-pagina');
  var PADRAO = 'Algo deu errado. Tente de novo.';

  function el(id) {
    return doc.getElementById(id);
  }

  /** Chama /api/conta/<acao>; nunca lança: sem rede vira status 0. */
  function chamar(acao, metodo, corpo) {
    var opcoes = { method: metodo, credentials: 'same-origin', headers: {} };
    if (metodo === 'POST') {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo || {});
    }
    return w
      .fetch('/api/conta/' + acao, opcoes)
      .then(function (r) {
        return r.json().then(
          function (c) {
            return { status: r.status, corpo: c || {} };
          },
          function () {
            return { status: r.status, corpo: {} };
          },
        );
      })
      .catch(function () {
        return { status: 0, corpo: { mensagem: 'Sem conexão. Tente de novo.' } };
      });
  }

  function mostrar(caixa, texto) {
    caixa.textContent = texto || '';
  }

  /** Liga um formulário: valida, desabilita o botão enquanto espera e entrega a resposta. */
  function ligar(form, caixaDeErro, enviar) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var botoes = form.querySelectorAll('button');
      mostrar(caixaDeErro, '');
      botoes.forEach(function (b) {
        b.disabled = true;
      });
      Promise.resolve(enviar())
        .catch(function () {
          mostrar(caixaDeErro, PADRAO);
        })
        .then(function () {
          botoes.forEach(function (b) {
            b.disabled = false;
          });
        });
    });
  }

  function erroDe(r) {
    return typeof r.corpo.mensagem === 'string' ? r.corpo.mensagem : PADRAO;
  }

  function valor(id) {
    return el(id).value;
  }

  function irPara(caminho) {
    w.location.assign(caminho);
  }

  var paginas = {
    entrar: function () {
      ligar(el('form'), el('erro'), function () {
        return chamar('entrar', 'POST', { email: valor('email'), senha: valor('senha') }).then(function (r) {
          if (r.status === 200) return irPara('/minha-conta');
          mostrar(el('erro'), erroDe(r));
        });
      });
    },

    'criar-conta': function () {
      ligar(el('form'), el('erro'), function () {
        return chamar('criar', 'POST', { email: valor('email'), nome: valor('nome'), senha: valor('senha') }).then(function (r) {
          if (r.status === 201) return irPara('/minha-conta');
          mostrar(el('erro'), erroDe(r));
        });
      });
    },

    'esqueci-a-senha': function () {
      ligar(el('form'), el('erro'), function () {
        mostrar(el('aviso'), '');
        return chamar('esqueci', 'POST', { email: valor('email') }).then(function (r) {
          if (r.status === 200) mostrar(el('aviso'), erroDe(r));
          else mostrar(el('erro'), erroDe(r));
        });
      });
    },

    'nova-senha': function () {
      var achado = /(?:^#|&)token=([A-Za-z0-9_-]+)/.exec(w.location.hash);
      var token = achado ? achado[1] : '';
      // o token sai do endereço na hora: não fica no histórico nem no que o navegador mostra
      if (w.location.hash) w.history.replaceState(null, '', w.location.pathname);
      if (!token) {
        el('sem-link').hidden = false;
        return;
      }
      el('form').hidden = false;
      ligar(el('form'), el('erro'), function () {
        if (valor('senha') !== valor('senha2')) {
          mostrar(el('erro'), 'As senhas não são iguais.');
          return;
        }
        return chamar('nova-senha', 'POST', { token: token, senha: valor('senha') }).then(function (r) {
          if (r.status === 200) return irPara('/minha-conta');
          mostrar(el('erro'), erroDe(r));
          el('outro-link').hidden = r.corpo.erro !== 'link-vencido';
        });
      });
    },

    'minha-conta': function () {
      var formExcluir = el('form-excluir');
      var primeiro = el('excluir-1');

      function pintar(conta) {
        el('v-email').textContent = conta.email;
        el('v-saldo').textContent = Number(conta.saldo).toLocaleString('pt-BR') + ' moedas';
        el('nome').value = conta.nome;
        el('usuario-excluir').value = conta.email;
      }

      chamar('eu', 'GET').then(function (r) {
        if (r.status === 401) return w.location.replace('/entrar');
        if (r.status !== 200 || !r.corpo.conta) {
          el('carregando').textContent = erroDe(r);
          return;
        }
        pintar(r.corpo.conta);
        el('carregando').hidden = true;
        el('painel').hidden = false;
      });

      ligar(el('form-nome'), el('erro-nome'), function () {
        mostrar(el('aviso-nome'), '');
        return chamar('nome', 'POST', { nome: valor('nome') }).then(function (r) {
          if (r.status === 200) {
            pintar(r.corpo.conta);
            mostrar(el('aviso-nome'), 'Nome salvo.');
          } else if (r.status === 401) {
            w.location.replace('/entrar');
          } else {
            mostrar(el('erro-nome'), erroDe(r));
          }
        });
      });

      el('sair').addEventListener('click', function () {
        var botao = el('sair');
        botao.disabled = true;
        mostrar(el('erro-sair'), '');
        chamar('sair', 'POST', {}).then(function (r) {
          if (r.status === 200) return irPara('/entrar');
          botao.disabled = false;
          mostrar(el('erro-sair'), erroDe(r));
        });
      });

      // excluir em dois passos: o primeiro botão só abre o campo da senha; quem exclui é o segundo
      primeiro.addEventListener('click', function () {
        primeiro.hidden = true;
        formExcluir.hidden = false;
        el('senha-excluir').focus();
      });
      el('excluir-cancelar').addEventListener('click', function () {
        formExcluir.reset();
        mostrar(el('erro-excluir'), '');
        formExcluir.hidden = true;
        primeiro.hidden = false;
        primeiro.focus();
      });
      ligar(formExcluir, el('erro-excluir'), function () {
        return chamar('excluir', 'POST', { senha: valor('senha-excluir') }).then(function (r) {
          if (r.status === 200) return irPara('/');
          if (r.status === 401 && r.corpo.erro === 'sem-sessao') return w.location.replace('/entrar');
          mostrar(el('erro-excluir'), erroDe(r));
        });
      });
    },
  };

  if (paginas[pagina]) paginas[pagina]();
})();
