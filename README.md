# Gelateria Management App

Aplicativo mobile (Expo + React Native) para gestão completa de uma gelateria, cobrindo produtos, receitas, estoque e produção com backend no Firebase.

## 📚 Sumário

- [Visão Geral](#-visão-geral)
- [Principais Funcionalidades](#-principais-funcionalidades)
- [Stack Tecnológica](#-stack-tecnológica)
- [Arquitetura do Projeto](#-arquitetura-do-projeto)
- [Configuração do Ambiente](#-configuração-do-ambiente)
- [Variáveis de Ambiente](#-variáveis-de-ambiente)
- [Scripts NPM](#-scripts-npm)
- [Fluxo de Desenvolvimento](#-fluxo-de-desenvolvimento)
- [Guia de Testes Manuais](#-guia-de-testes-manuais)
- [Roadmap](#-roadmap)
- [Contribuição](#-contribuição)
- [Licença](#-licença)

## 🎯 Visão Geral

Este repositório contém o app mobile destinado a tablets Android utilizados na operação diária da gelateria. O objetivo é oferecer uma experiência moderna, segura e eficiente para:

- Organizar produtos e receitas com hierarquia de componentes.
- Monitorar estoque em gramas com alertas proativos.
- Planejar e registrar produções, incluindo divergências e ajustes.
- Fornecer indicadores gerenciais e relatórios exportáveis.

O projeto segue padrões rígidos de qualidade para servir como base de estudo.

## 🍨 Principais Funcionalidades

- **Autenticação segura:** login individual, recuperação de senha, papéis (gelatiê, gerente, administrador) e controle básico de sessão.
- **Cadastro de produtos:** CRUD completo com informações como peso unitário, preço por grama e tags.
- **Cadastro de receitas:** receitas podem combinar produtos simples e sub-receitas, com regras para evitar loops e múltiplas bases.
- **Controle de estoque:** movimentações com histórico, controle por gramas, ponto mínimo e alertas automáticos com reconhecimento e resolução.
- **Central de notificações:** feed em tempo real para alertas críticos de estoque e eventos de produção, com marcação como lida.
- **Módulo de produção:** planejamento por data/quantidade, criação/edição de etapas, checagem automática de estoque, avanço de status e registro de divergências.
- **Recursos adicionais:** logs de auditoria, exportação de relatórios, dashboard inicial e documentação para integrações futuras.

## ✅ Atualizações Recentes (Out/2025)

- Padronizamos a ordem dos imports e zeramos os avisos do ESLint nas rotas, telas de estoque, produtos e receitas.
- As listas de produtos, receitas e estoque receberam badges consistentes, estados vazios memoizados e logging centralizado via `logError` para todas as ações críticas.
- A tela Home ganhou ações rápidas para criar produtos e planos de produção, além de botões para avançar/cancelar planos e marcar notificações; tudo respeitando permissões por papel.
- A Central de Notificações, os alertas e o detalhamento de estoque foram refatorados para remover componentes inline, garantir memoização de renderizadores e uniformizar estilos.
- O mock do Firestore foi reescrito com tipagem forte, helpers de transação e `jest.requireActual`; as suítes de serviços migraram para imports ESM, mantendo isolamento entre testes.
- Os scripts `npm run lint` e `npm test` estão passando limpos e fazem parte do checklist obrigatório descrito abaixo.

## 🛠️ Stack Tecnológica

- **Frontend:** React Native 0.81 (Expo 54) com TypeScript.
- **Design System:** tema próprio inicial; previsto uso de biblioteca (React Native Paper/NativeBase).
- **State & Context:** React Context API + hooks customizados (produtos, receitas e estoque usando Firestore em tempo real).
- **Backend:** Firebase Authentication (integração inicial), Firestore (coleções de produtos, receitas, estoque e movimentos), Cloud Functions (planejado para validações e jobs).
- **Qualidade:** ESLint, Prettier, TypeScript strict, variáveis em `.env`.

## 🧱 Arquitetura do Projeto

```
app/
├── App.tsx                  # Raiz do app (providers + navegação)
├── app.json
├── babel.config.js
├── index.ts
├── package.json
├── tsconfig.json
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   └── ScreenContainer.tsx
│   │   └── security/
│   │       └── RoleGate.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── domain/
│   │   ├── index.ts
│   │   └── models.ts
│   ├── hooks/
│   │   ├── data/
│   │   │   ├── useFirestoreSubscription.ts
│   │   │   ├── useNotifications.ts
│   │   │   ├── useProductionPlans.ts
│   │   │   ├── useProducts.ts
│   │   │   ├── useRecipes.ts
│   │   │   ├── useStock.ts
│   │   │   └── useStockAlerts.ts
│   │   ├── index.ts
│   │   ├── useAuth.ts
│   │   └── useAuthorization.ts
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   ├── index.ts
│   │   └── routes.ts
│   ├── providers/
│   │   ├── AppProviders.tsx
│   │   ├── AppThemeProvider.tsx
│   │   └── index.ts
│   ├── screens/
│   │   ├── Auth/
│   │   │   ├── index.ts
│   │   │   └── LoginScreen.tsx
│   │   └── Home/
│   │       └── HomeScreen.tsx
│   ├── services/
│   │   ├── firebase/
│   │   │   └── index.ts
│   │   └── firestore/
│   │       ├── index.ts
│   │       ├── notificationsService.ts
│   │       ├── productionService.ts
│   │       ├── productsService.ts
│   │       ├── recipesService.ts
│   │       ├── stockAlertsService.ts
│   │       ├── stockService.ts
│   │       ├── usersService.ts
│   │       └── utils.ts
│   ├── theme/
│   │   └── index.ts
│   └── utils/
│       ├── env.ts
│       └── logger.ts
├── tests/
│   ├── authPersistence.test.ts
│   ├── firestore/
│   │   ├── productsService.test.ts
│   │   ├── recipesService.test.ts
│   │   └── stockService.test.ts
│   ├── mocks/
│   │   └── firebaseFirestore.ts
│   └── setupTests.ts
├── firestore.rules          # Regras de segurança do Firestore (rascunho inicial)
└── ...
```

### Convenções adotadas

- Alias `@/` configurado em `tsconfig.json` e `babel.config.js` para importar arquivos dentro de `src/`.
- `providers` agregam contextos globais (tema, autenticação, etc.).
- `services/firebase` centraliza inicialização e integrações com o SDK do Firebase.
- `services/firestore` concentra os repositórios de dados (produtos, receitas e estoque) com CRUD tipado.
- `utils/env` lê valores com prefixo `EXPO_PUBLIC_` (necessário para Expo).

## 💻 Configuração do Ambiente

1. **Pré-requisitos**
   - Node.js 20+
   - npm 10+ (ou pnpm/yarn, se preferir adaptar)
   - Expo CLI global (opcional):

     ```powershell
     npm install -g expo-cli
     ```

2. **Instalação das dependências**

   ```powershell
   npm install
   ```

3. **Configurar variáveis de ambiente**
   - Renomeie `.env.example` para `.env`.
   - Preencha com os dados do seu projeto Firebase (seção abaixo).
   - Caso deseje usar um projeto diferente para testes, copie o `firebase-service-account.json` (não versionado) correspondente ou gere um novo serviço com permissão somente de leitura/escrita nas coleções utilizadas.

4. **Executar o app em modo desenvolvimento**

   ```powershell
   npm run start
   ```

   Use o Expo Go no dispositivo ou um emulador Android para visualizar.

5. **Executar em plataforma específica**

   ```powershell
   npm run android
   ```

   _(Para iOS, é necessário usar macOS: `npm run ios`.)_

6. **Rodar verificação completa antes de validar manualmente**

   ```powershell
   npm run lint
   npm run typecheck
   npm run test
   ```

## 🔐 Variáveis de Ambiente

| Variável                                   | Descrição                                | Exemplo                         |
| ------------------------------------------ | ---------------------------------------- | ------------------------------- |
| `EXPO_PUBLIC_FIREBASE_API_KEY`             | API key do Firebase                      | `AIza...`                       |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Domínio de autenticação                  | `sua-gelateria.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID`          | ID do projeto Firebase                   | `sua-gelateria`                 |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Bucket do Storage                        | `sua-gelateria.appspot.com`     |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID do FCM                         | `1234567890`                    |
| `EXPO_PUBLIC_FIREBASE_APP_ID`              | App ID                                   | `1:1234567890:web:abcdef`       |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID`      | (Opcional) Measurement ID para Analytics | `G-ABCDEF1234`                  |

> **Importante:** Todos os valores devem residir em `.env`, nunca em arquivos versionados. O `.gitignore` já está configurado para evitar commits acidentais.

## 🧪 Scripts NPM

| Script              | Descrição                                                                           |
| ------------------- | ----------------------------------------------------------------------------------- |
| `npm run start`     | Inicia o Expo no modo interativo.                                                   |
| `npm run android`   | Executa o app no dispositivo/emulador Android.                                      |
| `npm run ios`       | Executa no simulador iOS (necessário macOS).                                        |
| `npm run web`       | Abre a versão web (experimental) via Expo.                                          |
| `npm run lint`      | Roda o ESLint (`@react-native-community` + regras adicionais de import e Prettier). |
| `npm run lint:fix`  | Aplica correções automáticas do ESLint.                                             |
| `npm run format`    | Formata o código com Prettier.                                                      |
| `npm run typecheck` | Verifica tipos com `tsc --noEmit`.                                                  |
| `npm run test`      | Executa a suíte de testes unitários (Jest + ts-jest).                               |

## 🔄 Fluxo de Desenvolvimento

1. **Criar branch feature:** mantenha o `main` limpo; use feature branches para cada tarefa.
2. **Instalar dependências novas com cuidado:** qualquer adição deve atualizar `package.json` e `package-lock.json`.
3. **Seguir o design system:** utilize `ScreenContainer` e o tema de `src/theme` como base para novas telas.
4. **Variáveis sensíveis:** sempre via `utils/env` (com validações adicionais conforme necessidade).
5. **Antes de abrir PR:**
   ```powershell
   npm run lint
   npm run typecheck
   npm run format
   npm run test
   ```
6. **Testes automatizados:**
   - Suítes unitárias cobrem autenticação (persistência do Firebase Auth) e os serviços do Firestore de produtos, receitas e estoque — execute `npm run test` para validá-las.
   - À medida que novas telas forem adicionadas, priorize cobrir regras de acesso com UI tests (React Native Testing Library ou Detox) simulando papéis diferentes.

   ## 🧪 Guia de Testes Manuais

   Para validar o aplicativo de ponta a ponta após a instalação:
   1. **Autenticação**
      - Crie usuários diretamente no Firebase Auth e verifique login/logout.
      - Utilize “Esqueci minha senha” e confirme se o e-mail de reset é disparado.

   2. **Produtos & Receitas**
      - Cadastre um produto e confirme se ele aparece no catálogo e no formulário de receitas.
      - Monte uma receita utilizando produtos recém-criados e observe se o rendimento/ingredientes são persistidos corretamente.

   3. **Estoque**
      - Ajuste o estoque de um produto e confirme se o histórico registra a movimentação.
      - Forçe um nível abaixo do mínimo para disparar alerta e notificação; reconheça e resolva na Central de Alertas.

   4. **Planejamento de Produção**
      - Agende um plano na Home, valide sua exibição no Planejador (calendário/lista) e navegue para a tela de Execução.
      - Crie novas etapas (ex.: “Preparar base”, “Pasteurizar”), altere o status de cada uma e teste reabertura.

   5. **Execução e Estoque Automático**
      - Conclua um plano pelo botão “Concluir e baixar estoque”.
      - Verifique o resumo de movimentações gerado e confirme divergências criadas automaticamente em caso de falta de estoque.

   6. **Central de Notificações**
      - Certifique-se de que alertas e eventos de produção chegam na central e podem ser marcados como lidos.

   7. **Perfis e permissões**
      - Logue com usuários de papéis diferentes (gelatiê, gerente) e valide bloquêios de ações (cadastro, ajustes, produção).

   > Dica: manter um emulador Android e o Firestore console abertos acelera a verificação dos efeitos em tempo real.

## 🗺️ Roadmap

- [x] Integrar Firebase Authentication (login real + recuperação de senha).
- [x] Implementar CRUDs de produtos e receitas com Firestore (hooks + services com otimizações).
- [x] Construir módulo de estoque com alertas e histórico.
  - [x] Hooks e services de estoque com movimentos e ajustes otimistas.
  - [x] Alertas automáticos e notificações proativas.
- [x] Acrescentar cobertura de testes unitários aos serviços do Firestore (produtos, receitas e estoque).
- [x] Criar fluxo de produção (planejamento, baixa automática, divergências).
  - [x] Agendamento e acompanhamento de planos de produção.
  - [x] Execução com criação/edição de etapas.
  - [x] Baixa de estoque com registro de divergências automáticas.
- [x] Dashboard inicial com indicadores em tempo real (HomeScreen consumindo Firestore).
- [x] Rascunho inicial das regras de segurança do Firestore (`firestore.rules`).
- [ ] Exportação de relatórios (CSV/PDF) e backups automatizados.
- [ ] Notificações e lembretes (estoque baixo, ajustes periódicos, produção planejada).
- [ ] Pipeline CI/CD com GitHub Actions.

## 🤝 Contribuição

1. Faça um fork do repositório.
2. Crie uma branch para sua feature (`git checkout -b feature/nome-feature`).
3. Commit com mensagens descritivas (`feat: adiciona cadastro de produtos`).
4. Garanta que `npm run lint` e `npm run typecheck` passem.
5. Abra um Pull Request detalhando as mudanças, screenshots e passos de validação.

Recomenda-se usar commits pequenos e objetivos, facilitando revisão e reversão se necessário.

## 📄 Licença

Este projeto está licenciado sob os termos da [Licença MIT](./licence.md).
