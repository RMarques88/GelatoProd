# Como Configurar Testes E2E com Firebase Admin SDK

## 1. Obter Service Account Key do Firebase

Para rodar os testes E2E, você precisa de um arquivo `firebase-service-account.json` com as credenciais de administrador do Firebase.

### Passo a passo:

1. **Acesse o Firebase Console**: https://console.firebase.google.com
2. **Selecione seu projeto** (Gelateria V2)
3. **Vá em Configurações do Projeto** (ícone de engrenagem no canto superior esquerdo)
4. **Clique na aba "Contas de serviço"**
5. **Role até a seção "Firebase Admin SDK"**
6. **Clique em "Gerar nova chave privada"**
7. **Confirme clicando em "Gerar chave"**
8. **Salve o arquivo JSON baixado** como `firebase-service-account.json` na raiz do projeto `/app`

⚠️ **IMPORTANTE**: Este arquivo contém credenciais sensíveis! Nunca faça commit dele no Git.

### Estrutura do arquivo:

```json
{
  "type": "service_account",
  "project_id": "seu-projeto-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

### Verificação de segurança:

O arquivo já está listado no `.gitignore`:

```
firebase-service-account.json
```

## 2. Rodar os Testes E2E

### Comando para executar todos os testes E2E:

```bash
npm run test:e2e
```

### Rodar teste específico:

```bash
npm run test:e2e -- stockAlerts.e2e.test.ts
```

### Flags importantes:

- `--detectOpenHandles`: Detecta operações assíncronas pendentes
- `--forceExit`: Força saída após os testes (evita travamento de conexões)
- `--runInBand`: Roda testes sequencialmente (evita conflitos de dados)

## 3. Ambiente de Teste

### Proteções implementadas:

- ✅ **Validação de projeto**: Não permite rodar em produção sem flag explícita
- ✅ **Limpeza automática**: Todos os dados de teste são removidos no `afterAll`
- ✅ **Isolamento**: Cada teste cria seus próprios dados com nomes únicos

### Variável de ambiente (opcional):

Se você **realmente** precisar rodar testes no projeto de produção (NÃO RECOMENDADO):

```bash
$env:ALLOW_E2E_ON_PROD = "true"
npm run test:e2e
```

⚠️ **CUIDADO**: Isso pode afetar dados reais! Use apenas em ambientes controlados.

## 4. Cenários de Teste Disponíveis

### `tests/e2e/stockAlerts.e2e.test.ts`

Valida o sistema de alertas de estoque:

- ✅ Alerta CRITICAL quando estoque < 50% do mínimo
- ✅ Alerta WARNING quando estoque entre 50% e 100% do mínimo
- ✅ Resolução automática de alertas após reposição
- ✅ Sem alertas quando estoque está saudável

### Exemplo de execução:

```bash
npm run test:e2e

PASS  tests/e2e/stockAlerts.e2e.test.ts
  E2E: Stock Alerts
    ✓ deve criar alerta CRITICAL quando estoque cai abaixo de 50% do mínimo (1523ms)
    ✓ deve criar alerta WARNING quando estoque está entre 50% e 100% do mínimo (892ms)
    ✓ deve resolver alerta automaticamente quando estoque é reposto acima do mínimo (1245ms)
    ✓ NÃO deve criar alerta quando estoque está acima do mínimo (674ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

## 4. Fluxo destrutivo, backups e modo visual

Algumas operações E2E são destrutivas por design (por exemplo, testes que limpam coleções ou semeiam dados determinísticos). Para evitar perda acidental de dados, siga este fluxo recomendado:

- Sempre gere um backup local antes de executar qualquer teste destrutivo. Use o script:

```powershell
node ./scripts/backupFirestore.js
```

- Há um runner interativo em PowerShell que automatiza backup + confirmação antes de executar o teste destrutivo:

```powershell
./scripts/run-e2e-chain.ps1
```

O runner irá:

- perguntar se você deseja criar o backup local;
- criar o backup em `tests/e2e/backups/{timestamp}/`;
- pedir confirmação final (typing RUN) e então definir `ALLOW_E2E_ON_PROD=true` temporariamente para permitir a execução segura do teste destrutivo.

- O script de backup (`scripts/backupFirestore.js`) salva coleções alvo como JSON. Verifique os arquivos gerados antes de prosseguir.

Modo visual (`E2E_VISUAL`):

- Defina `E2E_VISUAL=true` para ativar hooks que adicionam pausas e logs humanos-friendly (pausas de ~5s entre testes, listagem de operações Firestore capturadas e tentativas de read-back/comparação). Isso é útil para inspeção manual e demos, mas não recomendado em CI.

- O helper `tests/e2e/e2eVisualHelper.ts` expõe `installVisualHooks()` e utilitários `e2eLog`/`compareAndLog` que os testes podem usar para emitir comparações ricas quando `E2E_VISUAL` está ativo.

Observação de segurança: mesmo com `E2E_VISUAL` ligado, o runner exige confirmação explícita antes de permitir operações destrutivas.

## 5. Próximos Passos

### Testes E2E a adicionar:

1. **Production Workflows** (`productionPlan.e2e.test.ts`)
   - Criar plano de produção
   - Executar etapas de produção
   - Validar consumo automático de estoque

2. **Recipe Management** (`recipes.e2e.test.ts`)
   - Criar receita simples
   - Criar receita com sub-receitas
   - Calcular custo total automaticamente

3. **Notifications** (`notifications.e2e.test.ts`)
   - Criar notificação
   - Marcar como lida
   - Limpar notificações antigas

4. **User Roles** (`authorization.e2e.test.ts`)
   - Validar permissões de gelatie
   - Validar permissões de estoquista
   - Validar permissões de produtor

## 6. Troubleshooting

### Erro: "Cannot find module 'firebase-admin'"

```bash
npm install --save-dev firebase-admin @types/node
```

### Erro: "ENOENT: no such file or directory, open 'firebase-service-account.json'"

Você precisa baixar o arquivo do Firebase Console (ver seção 1).

### Erro: "This project ID is production-like"

Adicione a variável de ambiente:

```bash
$env:ALLOW_E2E_ON_PROD = "true"
```

Ou use um projeto de teste/staging separado.

### Testes travando/não finalizando

Use as flags `--detectOpenHandles --forceExit` (já incluídas no script `test:e2e`).

## 7. Boas Práticas

✅ **FAÇA**:

- Use um projeto Firebase separado para testes (recomendado)
- Rode os testes antes de fazer deploy de mudanças críticas
- Adicione testes E2E para novas features complexas
- Limpe dados de teste no `afterAll`

❌ **NÃO FAÇA**:

- Rodar testes E2E em produção sem extrema necessidade
- Fazer commit do `firebase-service-account.json`
- Reutilizar dados de teste entre testes diferentes
- Desabilitar limpeza automática de dados

---

**Documentação criada em**: 2025
**Última atualização**: Setup inicial E2E infrastructure
