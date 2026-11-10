# Gerar ata a partir de áudio ou vídeo

## O que muda para o usuário
- A área de envio passa a aceitar também **áudio** (MP3, M4A, WAV, OGG, WEBM) e **vídeo** (MP4, MOV, WEBM), além de PDF/DOC/DOCX/TXT.
- Ao enviar áudio/vídeo, o site mostra etapas: "Extraindo áudio…" → "Transcrevendo (parte X de Y)…" → "Redigindo a ata…".
- Depois disso o fluxo é o mesmo de hoje: prévia, ajustes e "Baixar ata em Word".
- Opção extra: botão para **ver/baixar a transcrição** gerada (útil para conferência).

## Como funciona
1. O navegador extrai só o som do vídeo/áudio e o converte em formato leve (mono, 16 kHz), evitando enviar arquivos de vídeo grandes.
2. Reuniões longas são divididas em partes de ~10 minutos, transcritas uma a uma e unidas em ordem.
3. A transcrição completa segue para a mesma geração de ata já existente.

## Limites
- Arquivos até ~500 MB / ~3 horas (limitado pela memória do navegador).
- Qualidade depende do áudio; falas sobrepostas podem sair imperfeitas.
- Consome créditos de IA proporcionais à duração.

## Detalhes técnicos
- `src/lib/audio.ts`: decodifica com Web Audio API (`decodeAudioData`), reamostra para 16 kHz mono, fatia em blocos de 10 min e codifica WAV.
- Nova rota de servidor `src/routes/api/transcrever.ts` (multipart `file`), chamando `/v1/audio/transcriptions` do AI Gateway com `openai/gpt-transcribe`, idioma `pt`, validação de tamanho por bloco e tratamento de erros 402/429.
- `extract.ts`/`index.tsx`: detectar tipo de mídia, novo status de progresso, botão de transcrição.
- Teste ponta a ponta com áudio de fala real gerado por síntese de voz.
