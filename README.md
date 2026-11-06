# Respostas em Reunião — 0.4.4

Painel dentro da aba do Google Meet, do Teams ou do Zoom (sempre no navegador) para transcrever e traduzir a fala dos outros e sugerir respostas em reuniões avisadas. Não abre janela própria e não pede o microfone.

Esta versão restaura o currículo de Matheus Otto e as instruções de entrevista Java/Spring Boot. O contexto é incluído automaticamente em cada pedido de resposta, e pode ser conferido nas Configurações → Ver currículo e instruções de entrevista incluídos.

## Instalar

1. Em chrome://extensions, ligue o Modo do desenvolvedor.
2. Clique em Carregar sem compactação e escolha a pasta que contém manifest.json.
3. Clique no ícone da extensão em qualquer outra página para abrir as configurações e cole a chave do Gemini.
4. Recarregue a página da reunião.

## Usar

1. Avise os participantes (Copiar aviso ajuda), marque a caixa no painel e clique em Ligar.
2. No seletor do navegador, escolha a aba da reunião e marque Compartilhar áudio da aba.
3. A fala e a tradução aparecem à esquerda; as sugestões, à direita.
4. Uma pausa de cerca de 1,2 s aciona a análise. Responder agora aciona manualmente.
5. Arraste a barra de título para mover o painel; a posição fica salva. Minimizar recolhe o painel; Tamanho altera as dimensões; Desligar encerra a sessão e a captura.

O painel faz parte da aba, então pode aparecer se você transmitir essa aba ou a janela dela.

## Plataformas

| Plataforma | Endereços | Observação |
|---|---|---|
| Meet | meet.google.com | |
| Teams | teams.microsoft.com, teams.live.com, teams.cloud.microsoft | Escolha a aba efetiva da chamada, que pode ser outra além da aba de chat. |
| Zoom | zoom.us/wc/ e subdomínios | Só no cliente web: ao entrar, escolha "Entrar pelo navegador". |

Os aplicativos de desktop não carregam a extensão. Na aba da reunião, o ícone mostra ou recupera o painel; nas outras páginas, abre as configurações.

## Se não ouvir ninguém

Olhe a linha de diagnóstico do painel:

- **Pico de som:** deve variar quando alguém fala.
- **Capturando:** a origem informada pelo navegador; confira se é a aba da chamada.
- **Áudio:** deve estar `running`.
- **Mídia na página:** quantos elementos de áudio/vídeo a página tem e quantos estão tocando. Zero indica que a página toca o som por outra via.
- **Saída própria:** elementos enviados a um dispositivo escolhido pela página, e não ao padrão. Se aparecer com o pico em zero, teste a saída padrão nas configurações de áudio da reunião.
- **Enviado:** conta blocos repassados, inclusive silêncio. Não confirma recebimento pelo Google.

Se o pico ficar perto de zero com alguém falando, clique em Desligar, escolha Áudio do computador em Origem do áudio, clique em Ligar e selecione a tela inteira com Compartilhar áudio do sistema. Esse modo inclui sons de outros aplicativos e depende do navegador e do sistema.

## Respostas

- A fala nova é o alvo; a conversa recente só resolve referências.
- Cumprimentos e agradecimentos simples têm resposta fixa, sem chamar o modelo. Confirmações como "Okay" não geram resposta automática.
- A resposta é proporcional à pergunta: uma frase para conversa social, poucas para perguntas simples, até cerca de 120 palavras por idioma para questões técnicas.
- Lacunas aparecem entre colchetes para você completar. As respostas são rascunhos para revisar.
- Em Configurações, o contexto da reunião (projeto, prazos, pauta) é opcional e vai ao provedor selecionado a cada pedido de resposta.

Erros temporários do Gemini recebem até duas novas tentativas, respeitando a espera pedida pelo servidor. Se falharem, a pergunta fica em memória para Responder agora. Erros permanentes, como chave recusada, não se repetem.

## Privacidade e custo

O áudio vai para o Google. Para sugestões, a transcrição e o contexto vão para o provedor selecionado. A chave e as preferências ficam no armazenamento local da extensão, e as transcrições não são gravadas. A faixa de vídeo da captura só existe por exigência da API; nenhuma imagem é lida ou enviada.

Todos os blocos de áudio são enviados enquanto a captura está ligada, inclusive silêncio, o que consome a API. Desligue ao terminar.

## Validação

Execute `node --test "test/*.test.js"` dentro da pasta. Os testes simulam as APIs de mídia e os serviços; chamadas reais no Teams e no Zoom e o uso com chave real precisam ser conferidos em uso.


## Restauração do contexto — 0.4.2

Restaurado o src/interview-prompt.js da versão anterior, com currículo, dados pessoais fornecidos, motivação para trabalho remoto, inglês americano B2 e regras para perguntas técnicas, comportamentais e programação. Não foram acrescentadas experiências ou métricas novas.

O gerador volta a usar essas instruções em toda resposta. A pergunta determina o assunto e a extensão: cumprimento simples recebe somente saudação; cumprimento seguido de pergunta segue para a IA com a pergunta inteira. Não há apresentação profissional automática em resposta a um “Hello”. Tecnologias fora do currículo recebem somente contexto conceitual, sem inventar experiência.

As alterações de captura, reconhecimento das plataformas e movimentação/interface do painel deste ZIP foram preservadas. Nas configurações há uma visualização somente leitura do contexto incluído; o campo de contexto adicional e a chave existentes não são sobrescritos.

Para atualizar: substitua os arquivos na pasta atual da extensão, clique em Recarregar em chrome://extensions ou edge://extensions e recarregue as abas da reunião e de configurações. Confira a versão 0.4.2. Em uma nova instalação, configure novamente a chave. O ZIP entregue tem manifest.json na raiz.

O print com “Hello. What are you doing for a living?” não comprova sozinho a causa do cumprimento exibido. Há teste garantindo que essa frase completa não é tratada como saudação pura, mas a resposta real ainda depende da transcrição e do modelo.

Validação desta entrega: **138 testes Node passaram**, com chamadas simuladas, incluindo envio efetivo do prompt no pedido, saudações e pergunta completa do print. Não houve chamada real ao Gemini nem teste em reunião nesta execução.


## Controle de geração — 0.4.3

A caixa **Gerar respostas só ao clicar** fica abaixo das áreas de texto, próxima a Responder agora.

- Desmarcada (padrão): mantém a geração automática após uma pausa.
- Marcada: continua transcrevendo e traduzindo, mas só gera a sugestão ao clicar em **Responder agora**. A fala nova fica disponível para esse pedido.
- A preferência fica salva para as próximas aberturas. Ao marcar durante uma geração/tentativa, o pedido em andamento é cancelado e a pergunta é preservada. O cancelamento não desfaz consumo que já ocorreu no servidor.
- Ao desmarcar, a geração automática volta para a fala pendente ou nova.

O modo manual evita pedidos automáticos de sugestão, mas a API de transcrição/tradução continua em uso enquanto a captura está ligada. Ele não reduz por si só a latência do modelo após o clique. Currículo, instruções de entrevista, captura e movimentação do painel foram mantidos.

Atualize os arquivos na pasta atual, recarregue a extensão e a página da reunião. Confira a versão 0.4.3.

Validação da versão 0.4.3: **144 testes Node passaram**, incluindo modos automático/manual, restauração da preferência, cancelamento, preservação da pergunta e limpeza. Os serviços foram simulados; não houve medição de latência nem chamada real ao Gemini nesta execução.

## Provedor de respostas na versão 0.4.4

Em Configurações, preencha as chaves do Gemini e da OpenAI nos campos separados. Selecione Gemini ou GPT (OpenAI) em Provedor das sugestões de resposta. O padrão é Gemini e o GPT usa gpt-4.1-mini. A transcrição e a tradução usam a chave Gemini. A escolha é aplicada ao ligar a captura. Para trocar durante uma reunião, salve a seleção, desligue e ligue novamente.

Ao atualizar, recarregue a extensão e a aba da reunião. Autorize o acesso à API da OpenAI caso o navegador solicite.
