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

- **Autenticação segura:** login individual, papéis (gelatiê, gerente, administrador) e controle básico de sessão.
- **Cadastro de produtos:** CRUD completo com informações como peso unitário, preço por grama e tags.
- **Cadastro de receitas:** receitas podem combinar produtos simples e sub-receitas, com regras para evitar loops e múltiplas bases.
- **Controle de estoque:** movimentações com histórico, controle por gramas, ponto mínimo e alertas.
- **Módulo de produção:** planejamento por data/quantidade, checagem automática de estoque, baixa automática e registro de divergências.
- **Recursos adicionais:** logs de auditoria, notificações, exportação de relatórios, dashboard inicial e documentação para integrações futuras.

## 🛠️ Stack Tecnológica

- **Frontend:** React Native 0.81 (Expo 54) com TypeScript.
- **Design System:** tema próprio inicial; previsto uso de biblioteca (React Native Paper/NativeBase).
- **State & Context:** React Context API + hooks customizados.
- **Backend (planejado):** Firebase Authentication, Firestore, Cloud Functions (validações e jobs).
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
│   │   └── layout/
│   │       └── ScreenContainer.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── domain/
│   │   ├── index.ts
│   │   └── models.ts
│   ├── hooks/
│   │   └── useAuth.ts
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   └── index.ts
│   ├── providers/
│   │   ├── AppProviders.tsx
│   │   ├── AppThemeProvider.tsx
│   │   └── index.ts
│   ├── screens/
│   │   └── Home/
│   │       └── HomeScreen.tsx
│   ├── services/
│   │   ├── firebase/
│   │   │   └── index.ts
│   │   └── firestore/
│   │       ├── index.ts
│   │       ├── productsService.ts
│   │       ├── recipesService.ts
│   │       └── stockService.ts
│   ├── theme/
│   │   └── index.ts
│   └── utils/
│       ├── env.ts
│       └── logger.ts
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
   ```
6. **Testes automatizados:** em breve serão adicionados testes unitários e e2e; mantenha a arquitetura preparada para isso.

## 🗺️ Roadmap

- [ ] Integrar Firebase Authentication (login real + refresh token).
- [ ] Implementar CRUDs de produtos e receitas com Firestore.
- [ ] Construir módulo de estoque com alertas e histórico.
- [ ] Criar fluxo de produção (planejamento, baixa automática, divergências).
- [ ] Dashboard com indicadores e gráficos principais.
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
