# 🔗 Como Criar Índices do Firestore

Este documento explica como criar os índices compostos necessários para o funcionamento correto do app.

## 🚀 Método Recomendado: Usar Links Automáticos do Firestore

Quando você executar uma query que precisa de índice, o Firestore vai:

1. Exibir um erro no console do navegador/terminal
2. Incluir um **link direto** para criar o índice automaticamente

### Como usar o link automático:

1. **Copie o link** que aparece no erro do Firestore
2. **Cole no navegador** e pressione Enter
3. **Faça login** no Firebase Console (se necessário)
4. **Clique em "Create Index"** - o formulário já vem preenchido!
5. **Aguarde** a construção do índice (pode levar alguns minutos)

**Exemplo de erro:**

```
Error: The query requires an index. You can create it here:
https://console.firebase.google.com/v1/r/project/SEU-PROJETO/firestore/indexes?create_composite=...
```

### 💡 Dica de Desenvolvimento:

Ative no `.env`:

```
EXPO_PUBLIC_DEBUG_FIRESTORE_INDEX_HELPER=true
```

Isso fará o app exibir **banners visuais** com o link de criação quando um índice for necessário!

---

## 📝 Método Alternativo: Criar Manualmente

Se o link automático não estiver disponível, consulte o arquivo [`FIRESTORE_INDICES_MANUAL.md`](./FIRESTORE_INDICES_MANUAL.md) que contém tabelas detalhadas com todos os campos e direções necessárias para cada índice.

---

## 📋 INSTRUÇÕES PASSO A PASSO (Método Manual):

### 1. Acessar o Firebase Console

```
https://console.firebase.google.com/project/SEU-PROJETO-ID/firestore/indexes
```

Substitua `SEU-PROJETO-ID` pelo ID do seu projeto (valor de `EXPO_PUBLIC_FIREBASE_PROJECT_ID` no `.env`)

### 2. Criar Novo Índice

- Clique em **"Create Index"** ou **"Adicionar Índice"**
- Selecione a **Coleção** (ex: `notifications`, `stockAlerts`, etc.)
- No campo **"Query Scope"**, selecione **"Collection"**

### 3. Adicionar Campos

Para cada campo listado nas tabelas do `FIRESTORE_INDICES_MANUAL.md`:

- Clique em **"Add field"**
- Selecione o **nome do campo**
- Escolha a **direção** (Ascending/Crescente ou Descending/Decrescente)
- **IMPORTANTE**: O campo `__name__` é sempre o último e sempre Ascending

### 4. Salvar e Aguardar

- Clique em **"Create"**
- Status mudará de "Building" → "Enabled" (pode levar 5-15 minutos)
- Você receberá uma notificação quando estiver pronto

---

## ✅ Índices Necessários (Resumo)

### 1. **notifications**

Campos: `userId` (↑), `status` (↑), `createdAt` (↓), `__name__` (↓)

### 2. **productionPlans**

Campos: `archivedAt` (↑), `status` (↑), `scheduledDate` (↑), `__name__` (↑)

### 3. **stockAlerts** (ordenação padrão)

Campos: `status` (↑), `createdAt` (↓), `__name__` (↓)

### 4. **stockAlerts** (filtro por severidade)

Campos: `severity` (↑), `status` (↑), `updatedAt` (↓), `__name__` (↓)

### 5. **stockAlerts** (atualização recente)

Campos: `status` (↑), `updatedAt` (↓), `__name__` (↓)

### 6. **stockMovements** (histórico por produto)

Campos: `productId` (↑), `performedAt` (↓), `__name__` (↓)

### 7. **stockMovements** (histórico por item de estoque)

Campos: `stockItemId` (↑), `performedAt` (↓), `__name__` (↓)

### 8. **products** (filtro de ativos)

Campos: `isActive` (↑), `name` (↑), `__name__` (↑)

### 9. **recipes** (filtro de ativas)

Campos: `isActive` (↑), `name` (↑), `__name__` (↑)

### 10. **stockItems** (filtro não arquivados)

Campos: `archivedAt` (↑), `productId` (↑), `__name__` (↑)

### 11. **productionStages** (etapas de um plano)

Campos: `planId` (↑), `sequence` (↑), `__name__` (↑)

### 12. **productionStages** (etapas por status)

Campos: `planId` (↑), `status` (↑), `sequence` (↑), `__name__` (↑)

### 13. **productionDivergences** (divergências abertas)

Campos: `status` (↑), `createdAt` (↓), `__name__` (↓)

### 14. **productionDivergences** (por plano)

Campos: `planId` (↑), `createdAt` (↓), `__name__` (↓)

### 15. **productionPlans** (relatórios analíticos)

Campos: `status` (↑), `completedAt` (↓), `__name__` (↓)

### 16. **stockMovements** (consumo por tipo)

Campos: `type` (↑), `performedAt` (↓), `__name__` (↓)

### 17. **stockMovements** (histórico por operador)

Campos: `performedBy` (↑), `performedAt` (↓), `__name__` (↓)

### 18. **productionDivergences** (relatórios por tipo)

Campos: `type` (↑), `createdAt` (↓), `__name__` (↓)

**Legenda:**

- ↑ = Ascending / Crescente
- ↓ = Descending / Decrescente

---

## � Verificar Índices Criados

1. Acesse: `Firebase Console` → `Firestore Database` → `Indexes` → `Composite`
2. Verifique o status de cada índice:
   - 🔄 **Building**: Aguardando construção
   - ✅ **Enabled**: Pronto para uso
   - ❌ **Error**: Verifique configuração

---

## 🆘 Troubleshooting

### "The query requires an index"

- ✅ Use o link fornecido no erro para criar automaticamente
- ✅ Ou crie manualmente seguindo as tabelas do `FIRESTORE_INDICES_MANUAL.md`

### "Index already exists"

- ✅ Verifique na aba Indexes se o índice já está criado
- ✅ Aguarde se estiver com status "Building"

### Links automáticos não funcionam

- ✅ Verifique se está logado no Firebase Console
- ✅ Verifique se tem permissões de Editor no projeto
- ✅ Use o método manual como alternativa

---

## 📚 Documentação Relacionada

- [`FIRESTORE_INDICES_MANUAL.md`](./FIRESTORE_INDICES_MANUAL.md): Tabelas detalhadas de todos os índices
- [Firebase Docs: Indexes](https://firebase.google.com/docs/firestore/query-data/indexing): Documentação oficial
