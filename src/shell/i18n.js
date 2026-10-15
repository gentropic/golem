// The interface in English or Brazilian Portuguese. golem's own words (the page, the sidebar, the composer, the cards'
// frame, the messages) go through t(); the English is the key, so a sentence not translated yet shows in English and a
// placeholder ({name}) is filled in after the lookup. What a tool answers is the tool's, in English for now.
let cur = 'en';
export const uiLang = () => cur;
export function setUiLang(l) {
  cur = l === 'pt' ? 'pt' : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = cur === 'pt' ? 'pt-BR' : 'en';
}
export function t(s, v) {
  let out = cur === 'pt' && PT[s] != null ? PT[s] : s;
  if (v) out = out.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? String(v[k]) : m);
  return out;
}
// one word, singular or plural by n: t(plural(n, 'card', 'cards'))
export const plural = (n, one, many) => n === 1 ? one : many;
// the page's own text: elements marked data-t (their markup is the key) and data-t-attr ("placeholder title aria-label")
export function applyStatic(root) {
  root.querySelectorAll('[data-t]').forEach(el => { if (el.dataset.tEn == null) el.dataset.tEn = el.innerHTML; el.innerHTML = t(el.dataset.tEn); });
  root.querySelectorAll('[data-t-attr]').forEach(el => {
    for (const a of el.dataset.tAttr.split(' ')) { const k = 'tEn' + a.replace(/(^|-)(\w)/g, (m, d, c) => c.toUpperCase()); if (el.dataset[k] == null) el.dataset[k] = el.getAttribute(a) || ''; el.setAttribute(a, t(el.dataset[k])); }
  });
}

const PT = {
  // the page
  'New session': 'Nova sessão', 'Search every session': 'Buscar em todas as sessões', 'Search history': 'Buscar no histórico', 'Search every session (Ctrl+K)': 'Buscar em todas as sessões (Ctrl+K)',
  'Skills': 'Habilidades', 'Packs and this device': 'Pacotes e este aparelho', 'How golem reads': 'Como o golem lê', 'Theme': 'Tema', 'Language': 'Idioma', 'auto': 'auto', 'light': 'claro', 'dark': 'escuro',
  'Hide the sidebar': 'Esconder a barra lateral', 'Hide the sidebar (Ctrl+B)': 'Esconder a barra lateral (Ctrl+B)', 'Close the sidebar': 'Fechar a barra lateral', 'Sessions and history': 'Sessões e histórico',
  'Show the sidebar (Ctrl+B)': 'Mostrar a barra lateral (Ctrl+B)', 'New session (Ctrl+Shift+O)': 'Nova sessão (Ctrl+Shift+O)', 'awake': 'acordado', 'asleep': 'dormindo', 'on this device': 'neste aparelho',
  'in the lead-acid shell': 'no app lead-acid', 'sleep': 'dormir', 'wake': 'acordar', 'Sleep: golem reads and runs nothing until you wake it': 'Dormir: o golem não lê nem roda nada até você acordá-lo',
  'Requests golem has made to the network. Only installing a pack or checking for updates makes one.': 'Pedidos que o golem fez à rede. Só instalar um pacote ou buscar atualizações faz um.',
  '{n} request': '{n} pedido', '{n} requests': '{n} pedidos',
  'Ask, compute, or act. Nothing here calls a model: every answer is a reading you can check and a tool that computes. If I cannot read something, I say so.': 'Pergunte, calcule ou peça uma ação. Nada aqui chama um modelo: cada resposta é uma leitura que você pode conferir e uma ferramenta que calcula. Se eu não consigo ler algo, eu digo.',
  'Tap one to start, or type below. A few sessions already run are under Examples in the sidebar.': 'Toque em um para começar, ou escreva abaixo. Algumas sessões já feitas estão em Exemplos, na barra lateral.',
  'Example session': 'Sessão de exemplo', 'Questions and answers': 'Perguntas e respostas', 'Ask, compute, or act': 'Pergunte, calcule ou peça', 'Query': 'Pergunta', 'Completions': 'Sugestões',
  'Open a file: a table, a drawing or a document': 'Abrir um arquivo: uma tabela, um desenho ou um documento', 'Open a file': 'Abrir um arquivo', 'Run': 'Rodar',
  'Speak a question: the phone\'s own recognizer, offline': 'Falar uma pergunta: o reconhecedor do próprio celular, offline', 'Speak a question': 'Falar uma pergunta',
  'Enter runs · Tab completes · Shift+Enter for a new line · ↑ for earlier queries': 'Enter roda · Tab completa · Shift+Enter quebra a linha · ↑ volta às anteriores',
  'No model runs here. golem reads what you type, or says it cannot.': 'Nenhum modelo roda aqui. O golem lê o que você escreve, ou diz que não consegue.',
  'Ask': 'Perguntar', 'Packs': 'Pacotes', 'Drop to open': 'Solte para abrir',
  // the welcome's groups
  'In the field': 'No campo', 'Lab and tables': 'Laboratório e tabelas', 'Units and numbers': 'Unidades e números', 'Every day': 'Dia a dia',
  // the cards' frame
  'grammar': 'gramática', 'context': 'contexto', 'taught': 'ensinado', 'guess': 'palpite', 'no reading': 'sem leitura', 'read as': 'lido como', 'how': 'como', 'step': 'passo', 'steps': 'passos', 'from #{n}': 'de #{n}',
  'copy': 'copiar', 'edit': 'editar', 'pin': 'fixar', 'pinned': 'fixado', 'branch': 'ramificar', 'say': 'falar', 'or type it': 'ou escreva',
  'Copy the answer (c)': 'Copiar a resposta (c)', 'Put this question back in the box to change it (e)': 'Pôr esta pergunta de volta na caixa para mudá-la (e)', 'Keep this card at the top of the session (p)': 'Manter este cartão no topo da sessão (p)',
  'A new session with the cards up to this one': 'Uma sessão nova com os cartões até este', 'Read this answer aloud, with the phone\'s offline voice': 'Ler esta resposta em voz alta, com a voz offline do celular',
  'Tap to change this reading': 'Toque para mudar esta leitura', '{v}: tap to read it another way': '{v}: toque para ler de outro jeito',
  'Use my position': 'Usar minha posição', 'Take reading': 'Medir', 'no fix yet': 'sem posição ainda', 'waiting for the compass…': 'esperando a bússola…', 'The chart could not be drawn: {e}': 'Não consegui desenhar o gráfico: {e}',
  // messages
  'Copied.': 'Copiado.', 'Copy was blocked here. The text is shown so you can select it.': 'Copiar foi bloqueado aqui. O texto está à mostra para você selecionar.',
  'Back in the box: change it and press Enter. The answer comes as a new card.': 'De volta na caixa: mude e aperte Enter. A resposta vem num cartão novo.',
  'Pinned #{n}.': '#{n} fixado.', 'Unpinned #{n}.': '#{n} solto.', 'A new session, "{name}", with the cards up to #{n}.': 'Uma sessão nova, "{name}", com os cartões até #{n}.',
  'Opening your sessions…': 'Abrindo suas sessões…', 'Asleep. Tap wake at the top right.': 'Dormindo. Toque em acordar, no canto de cima.', 'New session.': 'Sessão nova.', 'Session named “{name}”.': 'Sessão chamada “{name}”.',
  'Answered #{n}: {label}': '#{n} respondido: {label}', 'Removed #{n}: {raw}': '#{n} removido: {raw}', 'Awake.': 'Acordado.', 'Asleep. Nothing runs until you wake it.': 'Dormindo. Nada roda até você acordá-lo.',
  'Saved {name} to Downloads.': '{name} salvo em Downloads.', 'Not saved: {e}': 'Não salvo: {e}', 'Saved {name}.': '{name} salvo.',
  'Listening. Tap the mic again to stop.': 'Ouvindo. Toque no microfone de novo para parar.', 'Heard. The reading is under the box; press Enter to run it.': 'Ouvi. A leitura está embaixo da caixa; aperte Enter para rodar.',
  'Nothing heard.': 'Não ouvi nada.', 'The recognizer stopped: {code}.': 'O reconhecedor parou: {code}.', 'Voice needs the microphone: allow it in the dialog, or in the app\'s settings.': 'A voz precisa do microfone: permita na caixa de diálogo, ou nas configurações do app.',
  'This phone has no offline recognizer for {lang}. Its language pack for offline speech is in the system settings.': 'Este celular não tem reconhecedor offline para {lang}. O pacote de idioma para fala offline fica nas configurações do sistema.',
  'Voice failed: {e}': 'A voz falhou: {e}', 'No offline voice for {lang} on this phone.': 'Não há voz offline para {lang} neste celular.', 'Could not speak: {e}': 'Não consegui falar: {e}',
  'The compass is not available here.': 'A bússola não está disponível aqui.', 'No reading from the compass yet: hold the phone still a moment.': 'Nenhuma leitura da bússola ainda: segure o celular parado um instante.',
  'Tap Take reading to turn the compass on.': 'Toque em Medir para ligar a bússola.', 'Compass on: hold the phone still, then take the reading.': 'Bússola ligada: segure o celular parado e meça.',
  'The compass needs the motion permission: allow it for this site in the browser.': 'A bússola precisa da permissão de movimento: permita para este site no navegador.', 'Position needs the location permission: allow it for this site in the browser.': 'A posição precisa da permissão de localização: permita para este site no navegador.',
  'In a browser the fix comes through the browser, which may ask its own location service for it.': 'No navegador a posição vem do navegador, que pode consultar o próprio serviço de localização.',
  'Add to station {name}': 'Adicionar à estação {name}', 'Remember: “{word}” means “{means}”': 'Lembrar: “{word}” quer dizer “{means}”',
  'Measured.': 'Medido.', 'Measured. The phone moved while measuring; hold it still for a steadier reading.': 'Medido. O celular se mexeu durante a medida; segure parado para uma leitura mais firme.',
  'Waiting for a fix…': 'Esperando uma posição…', 'Position needs the location permission: allow it in the dialog, or in the app\'s settings.': 'A posição precisa da permissão de localização: permita na caixa de diálogo, ou nas configurações do app.',
  'No position: {e}': 'Sem posição: {e}', 'No fix. Go where the sky is open and try again.': 'Sem posição. Vá para onde o céu está aberto e tente de novo.', 'Position taken, ±{m} m.': 'Posição registrada, ±{m} m.',
  'magnetic · compass {acc}': 'magnético · bússola {acc}', 'high': 'alta', 'medium': 'média', 'low': 'baixa', 'unreliable': 'não confiável', 'no sensor': 'sem sensor', 'not reported': 'não informada',
  'That file is over 20 MB. golem streams large CSV and TSV tables; a {ext} that large is not read.': 'Esse arquivo passa de 20 MB. O golem lê CSV e TSV grandes aos poucos; um {ext} desse tamanho não é lido.',
  'Opened {name} as a stream.': '{name} aberto aos poucos (stream).', '{name} could not be kept on this device; it works until the page closes.': 'Não consegui guardar {name} neste aparelho; funciona até a página fechar.',
  'Could not read that file.': 'Não consegui ler esse arquivo.', 'Not installed: {e}.': 'Não instalado: {e}.', 'That is not a golem session file.': 'Isso não é um arquivo de sessão do golem.', 'Imported "{name}".': '"{name}" importada.',
  'Opened {name}.': '{name} aberto.', 'Shared text is in the box: press Enter to run it.': 'O texto compartilhado está na caixa: aperte Enter para rodar.', 'Could not read the shared file: {e}': 'Não consegui ler o arquivo compartilhado: {e}',
  'Checking…': 'Verificando…', 'No worker controls this page yet. Reload once, then check again.': 'Nenhum worker controla esta página ainda. Recarregue uma vez e verifique de novo.', 'golem is up to date.': 'O golem está atualizado.',
  'This browser keeps nothing for golem: sessions last until the page closes.': 'Este navegador não guarda nada para o golem: as sessões duram até a página fechar.',
  // the drawer
  'Today': 'Hoje', 'This week': 'Esta semana', 'Earlier': 'Antes', 'Examples': 'Exemplos', 'example': 'exemplo', 'rename': 'renomear', 'export': 'exportar', 'delete': 'apagar', 'confirm delete': 'confirmar',
  '{n} card': '{n} cartão', '{n} cards': '{n} cartões', '{n} match in history': '{n} resultado no histórico', '{n} matches in history': '{n} resultados no histórico',
  'Session name. Leave empty to name it automatically.': 'Nome da sessão. Deixe vazio para dar nome automático.',
  // the Skills tab
  '{live} skills run here. {planned} more are planned from packages that already exist or are named here. Tap an example to run it.': '{live} habilidades rodam aqui. Mais {planned} estão planejadas, de pacotes que já existem ou estão nomeados aqui. Toque num exemplo para rodar.',
  'live': 'pronta', 'planned': 'planejada', 'Compute': 'Cálculo', 'Field': 'Campo', 'Table': 'Tabela', 'Knowledge': 'Conhecimento', 'Device': 'Aparelho', 'Session': 'Sessão',
  'Skill descriptions and answers are in English for now.': 'As descrições das habilidades e as respostas ainda estão em inglês.',
  // Packs and this device
  'golem knows what its installed packs hold. These are the gcu-library entries plus packs worth adding.': 'O golem sabe o que os pacotes instalados contêm. Estes são os itens da gcu-library, mais pacotes que valem acrescentar.',
  'Library': 'Biblioteca', 'installed': 'instalado', 'sample': 'amostra', 'not wired': 'não ligado', 'On this device': 'Neste aparelho', 'Taught words': 'Palavras ensinadas', 'Notes': 'Notas', 'Open table': 'Tabela aberta', 'Files on this device': 'Arquivos neste aparelho',
  'None yet. Try “pop means population”.': 'Nenhuma ainda. Experimente “pop means population”.', 'None yet. Try “remember that …”.': 'Nenhuma ainda. Experimente “lembra que …”.', 'None.': 'Nenhuma.', 'None yet. Tap the paperclip to open a CSV.': 'Nenhum ainda. Toque no clipe para abrir um CSV.',
  '{name} · {n} rows · {source}': '{name} · {n} linhas · {source}', 'sample data': 'dados de amostra', 'from your files': 'dos seus arquivos',
  'This app': 'Este app', 'Installed as an Android app through lead-acid. It has no network permission and checks for nothing: a new version comes as a new APK.': 'Instalado como app Android pelo lead-acid. Não tem permissão de rede e não verifica nada: uma versão nova vem como um APK novo.',
  'Opened as a file, so there is nothing to install or update. Served over https, golem installs as an app and works offline.': 'Aberto como arquivo, então não há nada a instalar ou atualizar. Servido por https, o golem se instala como app e funciona offline.',
  'Kept on this device and works offline. It looks for a new version only when you ask; that is one request to where golem came from.': 'Guardado neste aparelho e funciona offline. Só procura uma versão nova quando você pede; isso é um pedido para o lugar de onde o golem veio.',
  ' Last checked {time}.': ' Última verificação: {time}.', 'Reload to the new golem': 'Recarregar para o golem novo', 'Check for updates': 'Buscar atualizações',
  'Voice': 'Voz', 'The mic in the box listens with the phone\'s own recognizer, offline; what it hears goes into the box for you to check.': 'O microfone na caixa ouve com o reconhecedor do próprio celular, offline; o que ele ouve vai para a caixa para você conferir.',
  'No offline recognizer for {lang} on this phone, so there is no mic.': 'Não há reconhecedor offline para {lang} neste celular, então não há microfone.', 'Answers can be read aloud with the phone\'s offline voices.': 'As respostas podem ser lidas em voz alta com as vozes offline do celular.',
  'Reading every answer aloud': 'Lendo todas as respostas em voz alta', 'Read every answer aloud': 'Ler todas as respostas em voz alta', 'No offline voice for {lang}, so nothing is read aloud.': 'Não há voz offline para {lang}, então nada é lido em voz alta.',
  'This app has no network permission, so the library is out of reach from here: download the .gcudat from gcu-library in a browser and open it with the paperclip.': 'Este app não tem permissão de rede, então a biblioteca está fora de alcance daqui: baixe o .gcudat da gcu-library num navegador e abra com o clipe.',
  'Install from the library ({size})': 'Instalar da biblioteca ({size})', 'Install from the library (2.8 MB)': 'Instalar da biblioteca (2,8 MB)', 'With full profiles (5.1 MB)': 'Com os perfis completos (5,1 MB)', 'Add the full profiles (5.1 MB)': 'Acrescentar os perfis completos (5,1 MB)', 'Remove': 'Remover',
  'Installed: version {v}, kept on this device.': 'Instalado: versão {v}, guardado neste aparelho.', 'This browser gives golem no IndexedDB, so a pack cannot be kept.': 'Este navegador não dá IndexedDB ao golem, então um pacote não pode ser guardado.',
  ' Installing makes one request to the library for its list and one per pack; a .gcudat file opened with the paperclip installs with none.': ' Instalar faz um pedido à biblioteca pela lista e um por pacote; um arquivo .gcudat aberto com o clipe instala sem nenhum.',
  'The 14-country sample ships with golem.': 'A amostra de 14 países vem com o golem.', 'Installed: version {v}, {n} countries{full}. Kept on this device.': 'Instalado: versão {v}, {n} países{full}. Guardado neste aparelho.', ', with the full profiles': ', com os perfis completos',
  '{n} steps, in order.': '{n} passos, em ordem.', 'Stopped at step {k} of {n}: that step did not read.': 'Parou no passo {k} de {n}: esse passo não foi lido.', 'Step {k} of {n} asks a question; the rest did not run.': 'O passo {k} de {n} faz uma pergunta; o resto não rodou.',
  'Installing…': 'Instalando…', 'Installed: {n} countries{full}.': 'Instalado: {n} países{full}.', 'Removed. The 14-country sample answers again.': 'Removido. A amostra de 14 países responde de novo.',
  'A sample term index ships: where a term is defined, without the passage.': 'Vem um índice de termos de amostra: onde um termo é definido, sem o trecho.', 'Installed: {n} terms with their defining passages.': 'Instalado: {n} termos com os trechos que os definem.',
  'Removed. The sample term index answers again.': 'Removido. O índice de amostra responde de novo.', 'A sample of rules 10, 11 and 13 ships.': 'Vem uma amostra das regras 10, 11 e 13.',
  'Installed: {n} checks from its rules and chapter V.': 'Instalado: {n} verificações das regras e do capítulo V.', 'Removed. The sample checks answer again.': 'Removido. As verificações de amostra respondem de novo.'
};
