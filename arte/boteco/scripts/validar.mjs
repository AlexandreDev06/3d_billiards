import { readFileSync } from 'node:fs';
import validator from 'gltf-validator';
for (const arq of process.argv.slice(2)) {
  const dados = new Uint8Array(readFileSync(arq));
  const r = await validator.validateBytes(dados, { uri: arq, maxIssues: 0 });
  const m = r.issues.messages.filter((x) => x.severity <= 1);
  console.log(arq.split('/').pop(), 'erros', r.issues.numErrors, 'avisos', r.issues.numWarnings, 'infos', r.issues.numInfos, 'dicas', r.issues.numHints, 'versao', r.info.version, 'gerador', r.info.generator);
  const cont = {};
  for (const x of r.issues.messages) cont[`${['erro','aviso','info','dica'][x.severity]} ${x.code}`] = (cont[`${['erro','aviso','info','dica'][x.severity]} ${x.code}`] || 0) + 1;
  console.log(JSON.stringify(cont));
  for (const x of m.slice(0, 6)) console.log('  ', x.severity, x.code, x.message.slice(0, 160), x.pointer);
}
