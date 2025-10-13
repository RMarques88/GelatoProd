# Gelateria Management App

Aplicativo mobile (Expo + React Native) que organiza o dia a dia da produção artesanal: cadastro de produtos e receitas, controle de estoque por gramas, planejamento de produção e acompanhamento de alertas críticos em tempo real. Todo o backend roda em Firebase (Auth + Firestore) com regras afinadas para evitar abusos.

## 📚 Sumário

- [Visão Geral](#-visão-geral)
- [Principais Funcionalidades](#-principais-funcionalidades)
- [Atualizações Recentes](#-atualizações-recentes)
- [Stack Tecnológica](#-stack-tecnológica)
- [Arquitetura do Projeto](#-arquitetura-do-projeto)
- [Coleções do Firestore](#-coleções-do-firestore)
- [Configuração do Ambiente](#-configuração-do-ambiente)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Scripts NPM](#-scripts-npm)
- [Distribuição e Builds](#-distribuição-e-builds)
- [Fluxo de Desenvolvimento](#-fluxo-de-desenvolvimento)
- [Guia de Testes Manuais](#-guia-de-testes-manuais)
- [Segurança e Boas Práticas](#-segurança-e-boas-práticas)
- [Documentação Complementar](#-documentação-complementar)
- [Roadmap](#-roadmap)
- [Issues](#-issues)
- [Contribuição](#-contribuição)
- [Licença](#-licença)

## 🎯 Visão Geral

O app é pensado para tablets na loja. Ele dá conta de:

- Centralizar produtos, receitas e etapas de produção.
- Anotar movimentações de estoque com rastreabilidade e alertas quando o nível caiu demais.
- Planejar lotes de produção, registrar execução e divergências.
- Exibir indicadores práticos logo na tela inicial e empurrar notificações críticas para quem precisa agir.

## 🍨 Principais Funcionalidades

- **Autenticação com papéis claros:** login individual, recuperação de senha e verificação de permissões em cada fluxo.
- **Produtos e receitas inteligentes:** cadastros completos, com barcode via câmera, tags, sub-receitas e validações para evitar loops.
- **Catálogo de produtos com busca e validações:** busca por nome, código de barras, tags e categoria; validação de duplicidade de nome e de código de barras no cadastro/edição.
- **Estoque em tempo real:** histórico de movimentações, cálculo automático de custo unitário, alertas e notificações push internas.
- **Produção planejada:** calendário/lista de planos, execução com etapas e registro de divergências que alimentam o estoque.
- **Análises financeiras da produção:** estimativa de custo por lote, comparação com preço de venda configurável e visão rápida de margem por receita.
- **Dashboard operacional:** atalhos rápidos para criar lotes, aprovar etapas e resolver alertas diretamente da Home.

## ✅ Atualizações Recentes

- **Custos de produção de ponta a ponta:** planos agora guardam custo estimado durante o agendamento e custo real na execução, consolidando ingredientes, sub-receitas e ajustes em `productionScheduling.ts`, `productionExecution.ts` e serviços relacionados. Os hooks (`useProductionPlans`, `useStock`) já retornam os novos campos para consumo em qualquer tela.
- **Configuração central de preço de venda (`appSettings/pricing`):** criamos o serviço `pricingSettingsService`, hook `usePricingSettings` e validações de permissão/cooldown para o Gelatiê manter valores oficiais de preço por 100 g e por kg diretamente do app.
- **Relatórios com margem e receita estimada:** a tela `StockReportScreen` ganhou cards de custo real x estimado, projeção de receita por lote e destaque da margem. Também adicionamos formulário dedicado para salvar o preço de venda e feedback visual de sucesso/erro.
- **Relatórios operacionais com analytics integrado:** a tela de Relatórios de Estoque agora exibe cartões com divergências, produção planejada/executada e consumo, além de filtros de granularidade (diário/semanal/mensal) e intervalo. A navegação e a Home suportam atalhos com presets predefinidos.
- **Resumo unificado de métricas (`ReportingSummaryBundle`):** consolidamos a consulta de indicadores em `src/services/reportingMetrics.ts` e expomos via hook `useReportingSummaries`. O painel `ReportingAnalyticsPanel` mostra o estado de carregamento, erros e CTA de tentativa novamente.
- **Quick wins de Stage 5:** adicionamos documentação atualizada dos índices no Firestore (`CRIAR_INDICES_FIRESTORE.md`, `FIRESTORE_INDICES_MANUAL.md`) com novos pares de ordenação necessários aos relatórios. Também criamos um scaffold de migrações em `src/migrations/` para registrar scripts operacionais futuros.
- **Checagem de estoque no agendamento:** o app agora calcula os insumos necessários (inclusive receitas encadeadas) antes de confirmar um plano. Se faltar ingrediente, o Gelatiê precisa aprovar manualmente e a decisão gera um registro de divergência para acompanhamento posterior.
- **Execução integrada à checagem de disponibilidade:** a tela de execução passa a exibir o histórico de faltas aprovadas, pedir uma confirmação extra antes de iniciar planos com indisponibilidade e conciliar automaticamente a baixa de estoque com o registro de divergências e o log de disponibilidade.
- **Cobertura completa de testes E2E (28 cenários):** expandimos os testes End-to-End para cobrir todas as funcionalidades principais do sistema - alertas de estoque (4 testes), receitas simples e compostas (6 testes), planejamento e execução de produção (5 testes), notificações (6 testes) e autorização/permissões (7 testes). Infraestrutura completa com Firebase Admin SDK criando dados reais e validando comportamentos automaticamente. Veja [`E2E_TESTING_SETUP.md`](./E2E_TESTING_SETUP.md).
- Escaneamento de código de barras passou a usar `expo-camera`, com modal dedicado, verificação de permissões e fallback manual.
- **Validação de duplicados no cadastro de produtos:** impedimos salvar produtos com mesmo nome ou mesmo código de barras (checagem otimista no app e validação nos serviços do Firestore).
- **Busca no catálogo de produtos:** campo de busca na lista de produtos filtrando por nome, código de barras, tags e categoria, com botão de limpar.
- **Responsividade e tablets:** campos com scanner foram ajustados para altura/área de toque maiores em telas ≥ 768px; orientação do app configurável (padrão: acompanha rotação do dispositivo).
- Serviços do Firestore passaram a higienizar payloads (sem `undefined`), garantindo compatibilidade com `addDoc`/`updateDoc` e removendo erros silenciosos.
- Regras do Firestore agora exigem `serverTimestamp()` para `createdAt`/`updatedAt` e impõem cooldown mínimo por documento, reduzindo o consumo indevido de métricas.
- Regras do Firestore também normalizam papéis vindos do token/perfil (ex.: `gelatiê`) e documentamos índices necessários para consultas complexas.
- Hooks e serviços de receitas/estoque ganharam logging verbose para diagnosticar rapidamente falhas de permissão em ambiente de desenvolvimento.
- Tela de login recebeu hero visual com ícone oficial, reforçando a identidade da gelateria.
- Utilitário `formatRelativeDate` agora tem fallback próprio quando `Intl.RelativeTimeFormat` não está disponível (Hermes/Android).
- Hooks de dados ganharam memoização extra para impedir loops de renderização; lint e formatação foram alinhados no projeto inteiro.
- Scripts `npm run lint`, `npm run typecheck`, `npm test` e `npm run test:e2e` compõem o checklist obrigatório antes de publicar.

### 🧩 Acessórios & Overrides por Receita (Novo)

Implementado sistema de acessórios (copinhos, colheres, toppings rápidos, embalagens auxiliares) com opção de overrides específicos por receita para cálculo de margem nos relatórios e na Home.

Estrutura em `appSettings/pricing` (campo `accessories`):

```ts
type AccessoriesConfig = {
  items?: Array<{
    productId: string; // referência a products/{id}
    defaultQtyPerPortion: number; // quantidade padrão por porção base (100 g)
  }>;
  overridesByRecipeId?: Record<
    string,
    | Array<{
        productId: string;
        defaultQtyPerPortion: number;
      }>
    | undefined
  >;
};
```

Regras de precedência:

1. Se existir `overridesByRecipeId[recipeId]` com pelo menos 1 item → usa somente essa lista
2. Caso contrário → usa `items` globais
3. Ausência de ambos → custo de acessórios = 0

Conversão de custo (executada em `computeFinancialSummary` e equivalente no relatório de estoque):

```
porções = quantidade_produzida_em_gramas / 100
Para cada acessório selecionado:
   custo_unitário = averageUnitCostInBRL || highestUnitCostInBRL || 0 (do estoque)
   Se unidade do produto = UNITS:
      custo += defaultQtyPerPortion * custo_unitário * porções
   Senão (GRAMS / MILLILITERS ≈ 1g / KILOGRAMS / LITERS convertidos para g):
      grams = converterParaGramas(defaultQtyPerPortion)
      custo += grams * custo_unitário * porções
```

Heurística: 1 ml ≈ 1 g (aceita para simplificação operacional de embalagens/toppings líquidos de baixa densidade).

Semântica para “limpar” um override: remover todos os itens de uma receita pode ser interpretado como “sem acessórios para esta receita” — mantemos a chave com lista vazia? Atualmente: uma lista vazia **anula** o custo (não cai para globais). Documentar decisão ao usuário (UI futura pode oferecer botão “Reverter para globais”).

Impacto nas Telas:

- `RecipeFormScreen`: seção para editar overrides por receita.
- `FinancialReportScreen` e `Home` reutilizam util `computeFinancialSummary` garantindo consistência.
- `StockReportScreen`: já possuía cálculo alinhado; overrides respeitados.

Semântica de Reversão:

- A ação "Reverter para globais" na `RecipeFormScreen` remove a chave `overridesByRecipeId[recipeId]` do documento de pricing.
- Isso difere de salvar uma lista vazia. Lista vazia significa: "Esta receita NÃO usa acessórios" (custo zero, não cai nos globais).
- Removendo a chave, a receita volta a herdar `accessories.items` globais automaticamente.
- UI exibe badge "Overrides ativos" enquanto existir entrada não vazia para a receita.

Testes adicionados:

- `financialSummary.test.ts`: valida globais vs override e janela de datas.

Próximos incrementos sugeridos:

- Botão “Reverter para padrão” removendo entry do `overridesByRecipeId`.
- Indicador visual na UI quando uma receita está usando override (badge).
- Relatório detalhado de custo de acessórios por receita.

Índices Firestore: sem novos requisitos — consultas continuam baseadas em `productionPlans` por intervalo/status. Nenhum filtro adicional criado sobre o mapa de overrides (lido como documento único).

## 🛠️ Stack Tecnológica

- **Expo 54 / React Native 0.81** com TypeScript e alias `@/`.
- **UI:** tema proprietário inicial e componentes compartilhados (`ScreenContainer`, `RoleGate`, `BarcodeScannerField`).
- **Dados:** Firebase Authentication, Firestore (coleções: produtos, receitas, estoque, produção, notificações) e regras customizadas.
- **Ferramentas auxiliares:** `expo-camera`, `@react-native-async-storage/async-storage`, `@react-navigation/native`, Jest + ts-jest.
- **Qualidade:** ESLint + Prettier, TypeScript strict, log centralizado via `logger.ts`.

## 🧱 Arquitetura do Projeto

```
app/
├── App.tsx                # Providers globais + navegação
├── app.json               # Configuração Expo (plugins, permissões)
├── index.ts
├── package.json
├── tsconfig.json
├── firestore.rules        # Regras de segurança aplicadas no Firebase
├── src/
│   ├── components/
│   │   ├── inputs/
│   │   │   └── BarcodeScannerField.tsx
│   │   ├── layout/
│   │   │   └── ScreenContainer.tsx
│   │   └── security/
│   │       └── RoleGate.tsx
│   ├── contexts/
│   ├── domain/
│   ├── hooks/
│   │   ├── data/
│   │   └── useAuth.ts
│   ├── navigation/
│   ├── providers/
│   ├── screens/
│   ├── services/
│   │   ├── firebase/
│   │   └── firestore/
│   ├── migrations/
│   ├── theme/
│   └── utils/
│       ├── env.ts
│       └── logger.ts
└── tests/
    ├── e2e/                             # Testes End-to-End com Firebase Admin SDK
    │   ├── setup.ts                     # Configuração e helpers (clearCollection, createTestUser)
    │   ├── stockAlerts.e2e.test.ts      # Alertas de estoque (4 testes)
    │   ├── recipes.e2e.test.ts          # Receitas simples e compostas (6 testes)
    │   ├── production.e2e.test.ts       # Planejamento e execução de produção (5 testes)
    │   ├── notifications.e2e.test.ts    # Sistema de notificações (6 testes)
    │   └── authorization.e2e.test.ts    # Permissões e papéis de usuário (7 testes)
    ├── firestore/                       # Testes unitários de serviços Firestore
    ├── mocks/firebaseFirestore.ts
    └── setupTests.ts
```

### Convenções

- Imports internos usam `@/`. Ajuste o editor/IDE para respeitar a resolução.
- Providers são compostos em `AppProviders.tsx`; qualquer novo contexto entra ali.
- Os serviços do Firestore retornam tipos do domínio e são responsáveis por normalizar timestamps.
- Logs de erro devem passar por `logError` para manter saída consistente.
- Testes E2E criam dados reais no Firestore e limpam automaticamente após execução — veja [`E2E_TESTING_SETUP.md`](./E2E_TESTING_SETUP.md) para configuração.

## �️ Coleções do Firestore

| Coleção / Documento                                 | Campos principais                                                        | Observações de negócio                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `users`                                             | `displayName`, `role`, `phoneNumber`, timestamps                         | Sincronizado com Firebase Auth. Toda ação sensível consulta `useAuthorization` para validar permissões.        |
| `products`                                          | `name`, `tags`, `barcode`, `isActive`, `trackInventory`, `unitOfMeasure` | Base para estoque e receitas. Produtos arquivados permanecem referenciáveis por histórico.                     |
| `recipes`                                           | `yieldInGrams`, `ingredients[]`, `instructions`, `isActive`              | Ingredientes aceitam referência cruzada (recipe → recipe). Serviço impede ciclos infinitos.                    |
| `stockItems`                                        | `productId`, `currentQuantityInGrams`, `minimumQuantityInGrams`          | Mantém ponteiros para último movimento e custos médios/maiores. Gera alertas automaticamente abaixo do mínimo. |
| `stockMovements`                                    | `type`, `quantityInGrams`, `unitCostInBRL`, `performedBy`, `note`        | Histórico imutável; usado em relatórios e conciliação de custo.                                                |
| `stockAlerts`                                       | `status`, `severity`, `lastNotificationAt`                               | Notificações internas partem daqui. Gelatiê consegue reconhecer ou resolver; estoquista apenas reconhece.      |
| `productionPlans`                                   | `code`, `scheduledFor`, `status`, `estimated/actualProductionCost`       | Sequência automática (`PROD-001`). Integra com disponibilidade, execução e divergências.                       |
| `productionStages`                                  | `planId`, `sequence`, `status`, `assignedTo`, `timestamps`               | Descreve etapas operacionais. Atualização dispara logs e desbloqueio de ações na Home.                         |
| `productionDivergences`                             | `planId`, `severity`, `type`, `description`, `resolutionNotes`           | Criadas durante execução quando algo foge do planejado. Alimenta relatórios de performance.                    |
| `productionAvailability` (`planAvailability`)       | `planId`, `shortages[]`, `status`, `confirmedBy`, custos estimados       | Resultado da checagem de estoque antes da produção. Guarda confirmação manual do Gelatiê quando há falta.      |
| `notifications`                                     | `title`, `message`, `category`, `status`, `readAt`                       | Alimenta Home + Central. Consulta sempre retorna ordenado por `createdAt` desc. Limpeza automática > 30 dias.  |
| `appSettings/pricing` (subcoleção em `appSettings`) | `sellingPricePer100gInBRL`, `sellingPricePerKilogramInBRL`, `updatedBy`  | Mantém preço de venda global. Permissão exclusiva do Gelatiê; hook `usePricingSettings` provê cache.           |

- Todos os documentos herdam `createdAt`/`updatedAt` (server timestamps). Regras recusam payload sem `serverTimestamp()`.
- Índices obrigatórios estão listados em [`CRIAR_INDICES_FIRESTORE.md`](./CRIAR_INDICES_FIRESTORE.md) e [`FIRESTORE_INDICES_MANUAL.md`](./FIRESTORE_INDICES_MANUAL.md).
- Scripts de migração vivem em `src/migrations` e devem registrar alterações massivas para manter a rastreabilidade.

## �💻 Configuração do Ambiente

1. **Pré-requisitos**
   - Node.js 20+
   - npm 10+
   - Dispositivo ou emulador Android. Expo Go facilita os testes.

2. **Instalar dependências**

   ```powershell
   npm install
   ```

3. **Configurar variáveis**

- Copie `.env.example` para `.env` (arquivo não versionado).
- Preencha com as credenciais do projeto Firebase. Valores com prefixo `EXPO_PUBLIC_` ficam disponíveis ao bundle.

Principais artefatos e scripts relacionados aos E2E

- `tests/e2e/` — pasta com os testes End-to-End e helpers que usam Firebase Admin SDK. Veja `tests/e2e/setup.ts` para helpers (init Admin, clearCollection, gates de segurança) e instrumentação opcional para modo visual.
- `tests/e2e/backups/` — pasta local onde os scripts externos escrevem backups JSON (não commitados no repo).
- `tests/e2e/scanStockItems.js` — utilitário read-only que escaneia `stockItems` e gera uma amostra JSON; use antes de testes destrutivos para inspecionar o estado atual.
- `scripts/backupFirestore.js` — script Node (Admin SDK) que exporta coleções alvo para JSON em `tests/e2e/backups/`.
- `scripts/run-e2e-chain.ps1` — runner PowerShell interativo que:
  1. solicita confirmação do operador;
  2. executa `scripts/backupFirestore.js` para criar backup local;
  3. só então define a variável `ALLOW_E2E_ON_PROD=true` e roda o teste destrutivo.

Resumo dos cenários E2E (o que existe hoje)

- `readOnlyPriceCheck.e2e.test.ts` — diagnóstico read-only que calcula custo estimado para amostras [100g, 300g, 650g] e verifica a conversão R$/kg → R$/g. O teste é tolerante a falta de credenciais (não-falha em PERMISSION_DENIED).
- `seedAndValidateCosts.e2e.test.ts` — fluxo DESTRUTIVO (limpa coleções, semeia dados determinísticos e valida `computeRecipeEstimatedCost`). NUNCA rode sem backup local.
- `stockAlerts.e2e.test.ts` — alertas de estoque (vários cenários).
- `recipes.e2e.test.ts` — receitas simples e compostas.
- `production.e2e.test.ts` / `productionWithStockConsumption.e2e.test.ts` — planejamento, execução e consumo.
- `notifications.e2e.test.ts` — notificações (criar, ler, limpar).
- `authorization.e2e.test.ts` — permissões e papéis.
- `stockReservations.e2e.test.ts` — reservas de estoque.
- `accessoryOverrides.e2e.test.ts` — acessórios e overrides para cálculo de custo.

Como rodar os E2E (não-destrutivos)

1. Configure `firebase-service-account.json` no diretório `app/` (se você quiser que os testes leiam/escrevam via Admin). Alguns testes read-only podem ser executados sem credenciais e irão pular com aviso.
2. Instale dependências:

```powershell
npm install
```

3. Rodar apenas os testes não-destrutivos (ex.: diagnóstico read-only):

```powershell
npm run test:e2e -- tests/e2e/readOnlyPriceCheck.e2e.test.ts -- --runInBand --detectOpenHandles
```

Fluxo destrutivo seguro (backup obrigatório)

Este projeto separa o backup do teste destrutivo por segurança. Antes de executar `seedAndValidateCosts.e2e.test.ts` você deve criar um backup local e confirmar explicitamente que aceita sobrescrever/limpar coleções.

1. Gerar backup local (PowerShell):

```powershell
node ./scripts/backupFirestore.js
# ou usar o runner interativo abaixo
```

2. Rodar o fluxo interativo (executa backup e pede confirmação):

```powershell
./scripts/run-e2e-chain.ps1
```

O script irá:

- pedir confirmação textual para prosseguir;
- salvar backup em `tests/e2e/backups/` com timestamp;
- definir `ALLOW_E2E_ON_PROD=true` temporariamente e invocar o Jest apenas para o teste destrutivo selecionado.

3. Se preferir rodar manualmente (com backup já criado):

```powershell
$env:ALLOW_E2E_ON_PROD = 'true'; npm run test:e2e -- tests/e2e/seedAndValidateCosts.e2e.test.ts -- --runInBand --detectOpenHandles
```

Variáveis de ambiente relevantes

- `E2E_VISUAL` (true|false) — ativa o modo visual: hooks Jest adicionam pausas (5s por transição), logs detalhados e tentativas de read-back/compare. Use para demos manuais e inspeção humana.
- `ALLOW_E2E_ON_PROD` (true|false) — bloqueio de segurança. Se o `serviceAccount` aparentar ser de produção o teste destrutivo exige essa variável explicitamente.
- `FIREBASE_SERVICE_ACCOUNT` / `firebase-service-account.json` — arquivo de credenciais usado pelos scripts e pelos testes que inicializam o Admin SDK.
- `FORCE_JEST_EXIT` — (opcional) quando houver handles abertos que impedem o Jest de encerrar; use apenas em último caso.

Modo visual (E2E_VISUAL)

Quando `E2E_VISUAL=true` os testes:

- instalam hooks que pausam ~5 segundos entre passos para permitir inspeção manual;
- acumulam operações de escrita do Admin SDK e as imprimem ao final do teste (útil para ver o que será apagado/alterado);
- tentam fazer um read-back best-effort dos documentos modificados e imprimem diferenças (quando permissões permitem).

Backup e restauração

- O `scripts/backupFirestore.js` salva coleções alvo (listadas no script) em `tests/e2e/backups/{timestamp}/` como JSON. Esses arquivos não devem ser committed.
- Restauração automática NÃO é fornecida por segurança (evita sobrescrita acidental). Para restaurar, use os JSONs com um pequeno script de restore manual ou via Firebase import tools. Se precisar, eu posso adicionar um `scripts/restoreFromBackup.js` com confirmações manuais.

Avisos e boas práticas

- Nunca rode o teste destrutivo sem um backup válido e verificado.
- Prefira usar o runner interativo `./scripts/run-e2e-chain.ps1` para garantir que o backup foi criado e que um humano confirmou a operação.
- Revise o backup em `tests/e2e/backups/` antes de restaurar ou manipular dados de produção.
- Modo visual é para inspeção humana — evita automatizar esse modo em CI.

4. **Executar o app**

   ```powershell
   npm run start
   ```

   Abra o app via Expo Go (QR code) ou use `npm run android` para disparar direto no emulador.

5. **Configurar testes E2E** (opcional, mas recomendado)

- Baixe o `firebase-service-account.json` do Firebase Console (veja [`E2E_TESTING_SETUP.md`](./E2E_TESTING_SETUP.md)).
- Salve o arquivo na raiz de `/app` (já está no `.gitignore`).

## 🧪 Testes End-to-End — detalhes, segurança e execução

ATENÇÃO: a suíte E2E contém testes tanto READ-ONLY (diagnósticos não destrutivos) quanto testes DESTRUTIVOS que limpam coleções e semeiam dados de teste. Esses testes foram projetados para rodar em um ambiente de desenvolvimento/qa isolado e podem apagar dados em um projeto real se executados sem as devidas precauções. Leia esta seção com atenção antes de rodar qualquer comando.

6. **Checklist local**

   ```powershell
   npm run lint
   npm run typecheck
   npm run test
   npm run test:e2e  # Opcional: valida cenários complexos com dados reais
   ```

   Esses comandos precisam fechar sem erros antes de subir branch ou publicação.

## 🔐 Variáveis de Ambiente

| Variável                                   | Descrição                                                     | Exemplo                     |
| ------------------------------------------ | ------------------------------------------------------------- | --------------------------- |
| `EXPO_PUBLIC_FIREBASE_API_KEY`             | API key do Firebase                                           | `AIza...`                   |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Domínio do Firebase Auth                                      | `gelateria.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID`          | ID do projeto                                                 | `gelateria`                 |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Bucket do Storage                                             | `gelateria.appspot.com`     |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID do FCM                                              | `1234567890`                |
| `EXPO_PUBLIC_FIREBASE_APP_ID`              | App ID                                                        | `1:1234567890:web:abcdef`   |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID`      | (Opcional) Measurement ID para Analytics                      | `G-ABCDEF1234`              |
| `EXPO_PUBLIC_DEBUG_FIRESTORE_INDEX_HELPER` | Ativa banner com índice sugerido no modo dev (`true`/`false`) | `false`                     |

> Não compartilhe `.env`. Testes automatizados printam apenas os quatro últimos dígitos para conferência rápida.

## 🧪 Scripts NPM

| Script                      | Descrição                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `npm run start`             | Expo no modo interativo.                                                           |
| `npm run android`           | Build dev para um dispositivo/emulador Android.                                    |
| `npm run ios`               | Build dev no simulador iOS (necessário macOS).                                     |
| `npm run web`               | Versão web experimental.                                                           |
| `npm run lint`              | ESLint com zero tolerância a warnings.                                             |
| `npm run lint:fix`          | Tenta corrigir violações automaticamente.                                          |
| `npm run format`            | Prettier nos arquivos JS/TS/JSON/MD.                                               |
| `npm run format:check`      | Verifica formatação sem alterar arquivos.                                          |
| `npm run typecheck`         | `tsc --noEmit` para garantir compatibilidade de tipos.                             |
| `npm run test`              | Jest + ts-jest com mocks de Firestore (testes unitários).                          |
| `npm run test:e2e`          | Testes End-to-End com Firebase Admin SDK (requer `firebase-service-account.json`). |
| `npm run test:e2e:single`   | Executa um cenário E2E único (controlado por `E2E_SINGLE`) para depuração rápida.  |
| `npm run test:e2e:coverage` | Coleta cobertura dos testes E2E (gera pasta `coverage-e2e`).                       |
| `npm run db:seed:users`     | Popula usuários de teste no Firebase para cenários de desenvolvimento/E2E.         |
| `npm run db:wipe`           | Limpa coleções do Firestore usadas nos testes (cautela!).                          |

## 🎛️ Personalização do App (Ícone e Orientação)

Configurações principais ficam em `app/app.json`:

- Ícone do app (todas as plataformas):
  - `expo.icon`: caminho para o PNG (recomendado 512x512). Ex.: `"./assets/icon.png"`.
- Android Adaptive Icon:
  - `expo.android.adaptiveIcon.foregroundImage`: PNG com transparência (logo). Ex.: `"./assets/adaptive-icon.png"`.
  - `expo.android.adaptiveIcon.backgroundColor`: cor de fundo sólida (hex). Ex.: `"#ffffff"`.
- Favicon (Web):
  - `expo.web.favicon`: `"./assets/favicon.png"`.
- Orientação da tela:
  - `expo.orientation`: `"default"` para seguir a rotação do dispositivo (recomendado para tablets).
  - Para travar globalmente, use `"portrait"` ou `"landscape"`.
  - Travar por tela: opcionalmente, instale `expo-screen-orientation` e chame `ScreenOrientation.lockAsync(...)` na tela desejada.

Após substituir as imagens em `app/assets/`, gere uma nova build para ver o ícone atualizado no dispositivo.

## 🚀 Distribuição e Builds

### 1. Pré-requisitos e autenticação no Expo

1. Garanta dependências atualizadas e Expo CLI funcionando:

   ```powershell
   npm install
   npx expo doctor
   ```

2. Use a conta do Expo definida para o projeto. O login não fica salvo no repositório, então cada máquina precisa autenticar:

   ```powershell
   npx eas login          # Faz o login (usa browser/OTP)
   npx eas whoami         # Confirma usuário logado
   ```

3. Se for a primeira execução em um computador novo, rode a configuração automática. O arquivo `eas.json` já está versionado; este comando só garante o linking do app com o projeto Expo existente:

   ```powershell
   npx eas build:configure
   ```

### 2. Perfis de build disponíveis (`eas.json`)

| Perfil           | Destino                    | Observações                                                                                 |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `development`    | APK com Development Client | Hot reload + menus de debug. Usa `distribution: internal` para instalar direto no aparelho. |
| `preview`        | APK para testes internos   | Sem Development Client, ideal para QA curto.                                                |
| `production`     | AAB (Google Play)          | Incrementa `versionCode` automaticamente. Usado para Play Store / produção oficial.         |
| `production-apk` | APK assinado               | Canal `production`, distribuição interna, perfeito para sideload ou testes em campo.        |

Os certificados Android ficam sob gestão do Expo. Para revisar ou fazer backup manual, utilize `npx eas credentials`.

### 3. Preparar variáveis de ambiente para builds na nuvem

1. **Crie um arquivo dedicado a produção**, baseado no `.env.example` (nunca commitar valores sensíveis):

   ```powershell
   Copy-Item .env.example .env.production
   ```

2. Preencha as chaves Firebase/flags no `.env.production`. O serviço `src/utils/env.ts` utiliza apenas variáveis com prefixo `EXPO_PUBLIC_`, então nada extra é necessário.

3. **Envie as variáveis para o EAS**. A CLI 16+ suporta envio em lote com um único comando:

   ```powershell
   npx eas secret:push --scope project --env-file .env.production
   ```

   > Caso sua CLI esteja desatualizada, use `npx eas upgrade` ou crie secret por secret: `npx eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --value "..."`.

4. Valide o resultado com:

   ```powershell
   npx eas secret:list --scope project
   ```

5. Sempre que uma variável mudar, reenvie o arquivo `.env.production`. O EAS substitui valores existentes automaticamente.

### 4. Gerar APK/ABB com `npx`

**Build de produção (AAB para Play Store):**

```powershell
npx eas build --platform android --profile production
```

**Build direto em APK assinado (sideload / distribuição interna):**

```powershell
npx eas build --platform android --profile production-apk
```

- Use `--clear-cache` se notar resquícios de builds antigos.
- Ao final, o terminal mostra a URL do build (`https://expo.dev/accounts/<org>/projects/<app>/builds/<id>`). Baixe o artefato diretamente por lá.
- Para builds locais (exigem Android SDK instalado), adicione `--local`:

  ```powershell
  npx eas build --platform android --profile production-apk --local
  ```

### 5. Submissão e canais OTA

- Envie o AAB para a Play Store diretamente pela CLI:

  ```powershell
  npx eas submit --platform android --profile production
  ```

- Para atualizações OTA (JS bundle sem rebuild nativo), utilize os canais já configurados:

  ```powershell
  npx eas update --branch production --message "Correções de notificações"
  ```

  > O canal `production` é o mesmo usado pelo perfil `production-apk`, garantindo que os dispositivos recebam o bundle correto.

- Monitore builds e updates em tempo real no painel [Expo EAS Dashboard](https://expo.dev/accounts) com a mesma conta usada no login.

### 6. Checklist antes de publicar

1. Garanta que os testes e linters passaram (`npm run lint`, `npm run typecheck`, `npm run test`).
2. Confirme que `.env.production` corresponde ao ambiente (Firebase, Sentry, analytics, etc.).
3. Revise as notas de versão e atualize `app.json` (`expo.version`) caso publique novo patch.
4. Rode `npx eas update --branch preview` se quiser uma validação OTA antes de liberar para produção.
5. Faça download do build, instale em um dispositivo real e execute smoke tests: login, Home, fluxo de produção e central de notificações.

## 🔄 Fluxo de Desenvolvimento

1. Crie uma branch por feature/bugfix e mantenha mudanças isoladas.
2. Novas dependências precisam estar justificadas no PR e gerar lockfile atualizado.
3. Siga os componentes-base (`ScreenContainer`, etc.) ao criar telas.
4. Use `utils/env` para acessar variáveis — nada de `process.env` espalhado.
5. Antes de abrir PR:
   ```powershell
   npm run lint
   npm run typecheck
   npm run format
   npm run test
   ```
6. Registre no PR como foi validado (emulador, aparelho físico, screenshots).

## 🧪 Guia de Testes

### Testes Automatizados

#### Testes Unitários (`npm run test`)

- Validam serviços Firestore isoladamente com mocks
- Localizados em `tests/firestore/`
- Cobrem: produtos, receitas, estoque, movimentações

#### Testes End-to-End (`npm run test:e2e`)

- Validam fluxos completos com dados reais no Firestore
- Requerem `firebase-service-account.json` — veja [`E2E_TESTING_SETUP.md`](./E2E_TESTING_SETUP.md)

### Fluxo E2E com backup interativo

Adicionamos um script para executar os testes E2E destrutivos em cadeia com opção
interativa de backup local antes de qualquer wipe no banco. O script:

- Pergunta ao usuário se deseja criar backup local (Y/N).
- Se o usuário concordar, executa `node ./scripts/backupFirestore.js` e grava cópias
  JSON das coleções em `app/tests/e2e/backups/`.
- Em seguida pede confirmação final (`type RUN`) para executar os testes destrutivos
  (ex.: `seedAndValidateCosts.e2e.test.ts`).

Como usar (PowerShell):

```powershell
Set-Location -LiteralPath 'C:\Dev\Gelateria V2\app'
./scripts/run-e2e-chain.ps1
```

Avisos importantes:

- O backup é opcional, mas fortemente recomendado — backups geram leitura e custo no
  Firestore. Por isso movemos a criação dos backups para o script `run-e2e-chain.ps1`
  (o teste destrutivo em si não gera backups automaticamente).
- Nunca execute esse fluxo contra o banco de produção. Para segurança adicional o
  `tests/e2e/setup.ts` impedirá a execução caso o `project_id` pareça ser de
  produção a menos que `ALLOW_E2E_ON_PROD=true` esteja explicitamente definido.

Variáveis de ambiente relevantes para E2E e visualização

- `ALLOW_E2E_ON_PROD` (default `false`) — requer confirmação explícita para executar
  testes destrutivos em projetos cujo project_id pareça de produção.
- `E2E_VISUAL` (default `false`) — quando `true` ativa pausas de 5s entre testes e logs
  visuais (útil para observação manual; não recomendado em CI).
- `FORCE_JEST_EXIT` (default `false`) — quando `true` força `process.exit` na finalização
  do `globalTeardown` como fallback para handles abertos no CI.

Exemplo de fluxo seguro recomendado:

1. Copie `.env.example` para `.env` e preencha com as credenciais do projeto de teste.
2. Execute o script interativo:

```powershell
Set-Location -LiteralPath 'C:\Dev\Gelateria V2\app'
./scripts/run-e2e-chain.ps1
```

3. Siga as instruções na tela para criar backup e, somente depois de confirmar, execute os testes destrutivos.

- Localizados em `tests/e2e/`
- **28 cenários de teste implementados:**

  **✅ Alertas de Estoque** (`stockAlerts.e2e.test.ts` - 4 testes)
  - Alerta CRITICAL quando estoque < 50% do mínimo
  - Alerta WARNING quando estoque entre 50-100% do mínimo
  - Resolução automática após reposição
  - Sem alertas quando estoque está saudável

  **✅ Receitas** (`recipes.e2e.test.ts` - 6 testes)
  - Criação de receita simples com produtos e cálculo de custo
  - Criação de receita composta (com sub-receitas)
  - Prevenção de loops infinitos (receita A → B → A)
  - Edição de receita com atualização de timestamps
  - Cálculo correto de ingredientes totais
  - Validação de que rendimento corresponde à soma dos ingredientes

  **✅ Produção** (`production.e2e.test.ts` - 5 testes)
  - Criação de plano com código sequencial (PROD-001, PROD-002...)
  - Execução de etapas (completed → in_progress → pending)
  - Consumo automático de estoque ao completar produção
  - Registro e resolução de divergências (quality_issue, etc.)
  - Cancelamento de plano sem consumir estoque

  **✅ Notificações** (`notifications.e2e.test.ts` - 6 testes)
  - Criação de notificação crítica (stock_alert)
  - Marcar notificação como lida (status + readAt timestamp)
  - Filtrar notificações por status (apenas não lidas)
  - Limpeza de notificações antigas (>30 dias)
  - Criar múltiplos tipos (stock_alert, production_scheduled, system)
  - Ordenação por data (mais recentes primeiro)

  **✅ Autorização e Permissões** (`authorization.e2e.test.ts` - 7 testes)
  - Gelatie (admin) pode criar produtos, receitas, estoque e planos
  - Estoquista pode gerenciar estoque (criar items e movimentações)
  - Estoquista NÃO pode criar receitas (validação de permissão negada)
  - Produtor pode executar produção (criar etapas, atualizar status)
  - Produtor NÃO pode criar produtos (validação de permissão negada)
  - Validação de hierarquia: gelatie > estoquista > produtor
  - Isolamento de dados: usuários só veem suas próprias notificações

**Executar todos os testes:**

```powershell
npm run test        # Testes unitários (rápido, com mocks)
npm run test:e2e    # Testes E2E completos (requer service account)

# Executar teste específico (economiza transações Firebase):
npx jest tests/e2e/recipes.e2e.test.ts --detectOpenHandles --forceExit
```

### Testes Manuais

1. **Autenticação:** criar usuário no console, testar login/logout e fluxo de "Esqueci minha senha".
2. **Produtos:** cadastrar item com código de barras via câmera, editar tags e verificar se aparece em receitas.
3. **Receitas:** montar receita com sub-receita, confirmar cálculo de rendimento e ingredientes persistidos.
4. **Estoque:** executar ajuste de entrada com custo, confirmar histórico e disparo de alerta ao cair abaixo do mínimo.
5. **Produção:** abrir plano a partir da Home, avançar etapas, registrar divergência e observar ajustes de estoque.
6. **Notificações:** assegurar que alertas chegam na central e podem ser marcados como lidos.
7. **Perfis e permissões:** logar como gelatiê/gerente/admin e validar restrições (cadastro, ajustes, produção).

Use o console do Firestore ao lado para conferir writes e eventuais reprovações de regra.

## 🛡️ Segurança e Boas Práticas

- As regras `firestore.rules` exigem timestamps de servidor e respeitam um cooldown mínimo entre updates. Deploy:

  ```powershell
  firebase deploy --only firestore:rules
  ```

- O app só aceita requisições autenticadas. Reforce com Firebase App Check assim que possível.
- Monitorar o painel de métricas do Firestore ajuda a detectar loops. Se algo subir demais repentinamente, desligue o recurso investigado.
- Ative `EXPO_PUBLIC_DEBUG_FIRESTORE_INDEX_HELPER=true` no `.env` para que o app exiba, em modo dev, banners com links de criação automática quando o Firestore solicitar novos índices.

## 📎 Documentação Complementar

- **[`E2E_TESTING_SETUP.md`](./E2E_TESTING_SETUP.md)**: configuração completa dos testes End-to-End, incluindo como obter o `firebase-service-account.json`, rodar testes e troubleshooting. **Leia antes de executar `npm run test:e2e`**.
- [`CRIAR_INDICES_FIRESTORE.md`](./CRIAR_INDICES_FIRESTORE.md): guia completo sobre como criar índices do Firestore usando links automáticos ou método manual.
- [`FIRESTORE_INDICES_MANUAL.md`](./FIRESTORE_INDICES_MANUAL.md): tabelas detalhadas com todos os campos e direções necessárias para cada índice composto.
- Para problemas de segurança/regras, veja também os logs adicionados em `src/services/firestore` e nos hooks de dados; eles descrevem o payload enviado e o erro recebido do Firebase.

## 🗺️ Roadmap

- [x] Autenticação com papéis e recuperação de senha.
- [x] CRUD de produtos com scanner de código de barras.
- [x] Receitas com ingredientes compostos e testes automatizados.
- [x] Estoque com alertas, histórico e notificações.
- [x] Planejamento/execução de produção com divergências.
- [x] Dashboard operacional na Home.
- [x] Regras de segurança endurecidas (server timestamps + cooldowns).
- [x] **Testes E2E com Firebase Admin SDK** para validação automatizada de cenários complexos.
- [x] **Cobertura completa de testes E2E** (28 cenários): alertas de estoque, receitas compostas, produção, notificações e permissões.
- [ ] Exportação de relatórios (CSV/PDF) e backups automatizados.
- [ ] Notificações externas (push/email) com App Check habilitado.
- [ ] Pipeline CI/CD no GitHub Actions.

## 📝 Issues

Encontrou um bug, comportamento estranho ou tem uma sugestão urgente? Abra uma issue no repositório GitHub para que o time acompanhe de perto:

- Acesse [Issues do projeto](https://github.com/RMarques88/GelatoProd/issues/new/choose) e selecione o template apropriado (bug, melhoria ou tarefa técnica).
- Preencha o título e descreva o contexto com o máximo de detalhes (passo a passo para reproduzir, prints/logs relevantes, impacto percebido).
- Indique o ambiente afetado (produção, homologação, dispositivo, versão do app) e se existe workaround.
- Se o problema envolver dados sensíveis, sinalize no corpo da issue e compartilhe as evidências em canal privado.

Issues bem documentadas aceleram o atendimento e evitam deslocamentos desnecessários. Sempre que possível, vincule PRs ou commits relacionados para manter o histórico organizado.

## 🤝 Contribuição

1. Fork no GitHub e branch dedicada (`feature/nome-da-feature`).
2. Commits curtos com mensagens claras (`feat: adiciona alerta crítico`).
3. Rode lint, typecheck e testes (unitários + E2E) antes de subir:
   ```powershell
   npm run lint
   npm run typecheck
   npm run test
   npm run test:e2e  # Se tiver firebase-service-account.json configurado
   ```
4. Abra PR com contexto, screenshots e passos de teste.

## Sugestões

Se você tiver alguma sugestão para melhorar o desenvolvimento da aplicação, features novas, mudanças em regras de negócios, aprimoramento e otimização de processos, siga o próximo passo. Toda ajuda à melhorar a aplicaçao é bem vinda!

## 📄 Licença

Projeto licenciado sob os termos da [Licença MIT](./licence.md).
