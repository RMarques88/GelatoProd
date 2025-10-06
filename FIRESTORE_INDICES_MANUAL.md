# Índices do Firestore - Instruções Manuais

---

## 📋 Como criar índices manualmente

1. **Acesse o Firebase Console**:

   ```
   https://console.firebase.google.com/project/SEU-PROJETO-ID/firestore/indexes
   ```

   Substitua `SEU-PROJETO-ID` pelo valor de `EXPO_PUBLIC_FIREBASE_PROJECT_ID` do seu `.env`

2. Clique em **"Create Index"** ou **"Adicionar índice"**
3. Preencha os campos conforme as tabelas abaixo
4. **IMPORTANTE:** Sempre selecione **"Collection"** (Coleção) no campo "Query Scope" (Escopo da consulta)

---

## ✅ Índices que FUNCIONARAM (já criados)

### 1. notifications

| Campo     | Direção     |
| --------- | ----------- |
| status    | Crescente   |
| createdAt | Decrescente |
| **name**  | Decrescente |

### 2. productionPlans

| Campo        | Direção   |
| ------------ | --------- |
| archivedAt   | Crescente |
| status       | Crescente |
| scheduledFor | Crescente |
| **name**     | Crescente |

### 3. stockAlerts

**Consulta padrão (lista/ordenada por atualização)**

| Campo     | Direção     |
| --------- | ----------- |
| status    | Crescente   |
| updatedAt | Decrescente |
| **name**  | Decrescente |

**Consulta "apenas críticos"**

| Campo     | Direção     |
| --------- | ----------- |
| severity  | Crescente   |
| status    | Crescente   |
| updatedAt | Decrescente |
| **name**  | Decrescente |

---

### 4. products

**Query:** `isActive` + `name ASC`

| Campo    | Direção     |
| -------- | ----------- |
| Escopo   | **Coleção** |
| isActive | Crescente   |
| name     | Crescente   |
| **name** | Crescente   |

---

### 5. recipes

**Query:** `isActive` + `name ASC`

| Campo    | Direção     |
| -------- | ----------- |
| Escopo   | **Coleção** |
| isActive | Crescente   |
| name     | Crescente   |
| **name** | Crescente   |

---

### 6. stockItems

**Query:** `archivedAt` + `productId ASC`

| Campo      | Direção     |
| ---------- | ----------- |
| Escopo     | **Coleção** |
| archivedAt | Crescente   |
| productId  | Crescente   |
| **name**   | Crescente   |

---

### 7. stockMovements

**Query histórico por produto:** `productId` + `performedAt DESC`

| Campo       | Direção     |
| ----------- | ----------- |
| Escopo      | **Coleção** |
| productId   | Crescente   |
| performedAt | Decrescente |
| **name**    | Decrescente |

**Query histórico por item de estoque:** `stockItemId` + `performedAt DESC`

| Campo       | Direção     |
| ----------- | ----------- |
| Escopo      | **Coleção** |
| stockItemId | Crescente   |
| performedAt | Decrescente |
| **name**    | Decrescente |

---

### 8. productionStages

**Query etapas de um plano específico:** `planId` + `sequence ASC`

| Campo    | Direção     |
| -------- | ----------- |
| Escopo   | **Coleção** |
| planId   | Crescente   |
| sequence | Crescente   |
| **name** | Crescente   |

**Query etapas por status em um plano:** `planId` + `status` + `sequence ASC`

| Campo    | Direção     |
| -------- | ----------- |
| Escopo   | **Coleção** |
| planId   | Crescente   |
| status   | Crescente   |
| sequence | Crescente   |
| **name** | Crescente   |

---

### 9. productionDivergences

**Consulta geral (divergências abertas ordenadas por criação):** `status` + `createdAt DESC`

| Campo     | Direção     |
| --------- | ----------- |
| Escopo    | **Coleção** |
| status    | Crescente   |
| createdAt | Decrescente |
| **name**  | Decrescente |

**Consulta por plano (histórico recente):** `planId` + `createdAt DESC`

| Campo     | Direção     |
| --------- | ----------- |
| Escopo    | **Coleção** |
| planId    | Crescente   |
| createdAt | Decrescente |
| **name**  | Decrescente |

---

### 10. productionPlans (relatórios analíticos)

**Query:** `status == completed` + `completedAt DESC`

| Campo       | Direção     |
| ----------- | ----------- |
| Escopo      | **Coleção** |
| status      | Crescente   |
| completedAt | Decrescente |
| **name**    | Decrescente |

---

### 11. stockMovements (consumo por tipo)

**Query:** `type == decrement` + `performedAt DESC`

| Campo       | Direção     |
| ----------- | ----------- |
| Escopo      | **Coleção** |
| type        | Crescente   |
| performedAt | Decrescente |
| **name**    | Decrescente |

---

### 12. stockMovements (historico por operador)

**Query:** `performedBy == userId` + `performedAt DESC`

| Campo       | Direção     |
| ----------- | ----------- |
| Escopo      | **Coleção** |
| performedBy | Crescente   |
| performedAt | Decrescente |
| **name**    | Decrescente |

---

### 13. productionDivergences (relatórios por tipo)

**Query:** `type == ingredient_shortage` + `createdAt DESC`

| Campo     | Direção     |
| --------- | ----------- |
| Escopo    | **Coleção** |
| type      | Crescente   |
| createdAt | Decrescente |
| **name**  | Decrescente |

---

## ⏱️ Tempo de criação

Após criar cada índice, aguarde 5-15 minutos para ficar "Ativado".
Recarregue o app com 'r' no terminal Expo após todos ficarem ativos.

---

## 🐛 Se aparecer mais erros

1. Leia a mensagem vermelha na tela do app
2. Identifique a coleção e os campos da query
3. Crie o índice manualmente no Firebase Console
4. Sempre use **"Coleção"** como escopo
5. Respeite a ordem dos campos exatamente como aparece no erro
