# Identidade, segurança e configuração

## Identidade e segurança no cliente

- Login Google fornece token ao backend, que deve validar assinatura/audiência antes
  de estabelecer identidade. O cliente não considera conteúdo decodificado localmente
  como autenticação válida.
- Sessão visitante tem TTL de duas horas. Alternar para visitante preserva a identidade
  Google restaurável, mas os conjuntos de histórico não podem ser combinados.
- Chamadas pessoais levam a identidade ativa em `X-User-Id`; porém o modelo de
  confiança/autorização desse cabeçalho está **pendente** e é uma lacuna crítica.
- Logout durante fechamento deve ser compatível com `sendBeacon`; rota e payload
  ainda precisam ser contratados.
- Variáveis `VITE_*` entram no bundle público. Nunca colocar `GEMINI_API_KEY`, token,
  segredo OAuth ou credencial de provedor no frontend.
- `GOOGLE_CLIENT_ID` é identificador público, mas nome exato da variável Vite ainda
  está pendente. A URL da API também precisa de nome estabilizado.
- Links Google Maps e WhatsApp devem usar codificação segura e dados da rota ativa.
- O compartilhamento precisa de consentimento; a política sobre nome, localização e
  histórico não está definida.
- Não registrar tokens, payload pessoal integral ou identificador cru em console;
  a telemetria visual deve mascarar o correlation ID/identidade quando apropriado.
- CORS é proteção do navegador, não autorização. O frontend não pode assumir que um
  `X-User-Id` arbitrário prova posse do histórico.

## Ambiente local

```powershell
# raiz do monorepo
npm install
npm run dev

# somente frontend
cd app/frontend
npm run dev
```

Serviços locais:

| Serviço | Endereço |
| --- | --- |
| SPA | `http://localhost:5173` |
| preview | `http://localhost:4173` |
| API | `http://localhost:8001` |
| Swagger/ReDoc | `http://localhost:8001/docs`, `/redoc` |

## Variáveis do frontend

`src/config.ts` deve centralizar a URL da API e o Google Client ID. Os nomes exatos
estão pendentes; antes de implementar, aprovar e registrar algo como
`VITE_API_BASE_URL` e `VITE_GOOGLE_CLIENT_ID` em um `.env.example` específico e sem
segredos. O `.env.example` atual da raiz só documenta Gemini e não atende o frontend.

## Build e implantação

`npm run build` produz `dist/`, mas a documentação não define hospedagem, URL pública,
pipeline de publicação, cache HTTP, fallback de SPA, HTTPS, CSP nem política do proxy
para SSE. Antes de homologação/produção, definir:

- servidor/CDN de arquivos estáticos e fallback de navegação para `index.html`;
- injeção ou build das variáveis por ambiente;
- HTTPS, domínios, allowlist CORS e origens Google autorizadas;
- proxy com streaming sem buffering e timeouts compatíveis;
- estratégia de cache e invalidação dos assets versionados;
- política de segurança de conteúdo e fontes/map tiles permitidos;
- browsers mínimos e suporte efetivo do manifesto/PWA;
- rollback, SLO, alertas e evidência de smoke test pós-publicação.

O manifesto web está na estrutura-alvo, mas suporte offline/PWA não está confirmado.
