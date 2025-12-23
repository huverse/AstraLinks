# LogicWorldEngine 文档

## 设计目标

验证"理性世界"的可行性：

| 要求 | 结果 |
|------|------|
| 世界目标是"正确性" | ✅ 非赢/输 |
| 推理可验证、可反驳、可接续 | ✅ PROPOSAL → ACCEPTED/REJECTED |
| 形式化结果优先 | ✅ LaTeX 输出 |
| 错误结论不污染 World State | ✅ pending → rejected |

---

## 世界设定

```
Problem State:
├── hypotheses: Map<id, Hypothesis>  (假设集)
├── conclusions: Map<id, Conclusion> (已接受结论)
├── pendingProposals: Map<id, Conclusion> (待处理)
├── goals: Map<id, Goal>             (未解决目标)
└── refutations: Map<id, Refutation> (反驳记录)
```

---

## Action 定义

### derive
提出新推导：
```typescript
{
    actionType: 'derive',
    params: {
        conclusion: "$a + b = c$",     // LaTeX
        premises: ["H-1", "C-001"],    // 前提 ID
        rule: "modus_ponens",          // 推导规则
        explanation?: "由假设1推得"     // 可选
    }
}
```

### refute
指出错误/矛盾：
```typescript
{
    actionType: 'refute',
    params: {
        targetId: "C-002",
        type: "contradiction" | "invalid_derivation" | "missing_premise" | "circular",
        reason: "$C-002$ 与 $H-1$ 矛盾"
    }
}
```

### extend
基于已有结论推进：
```typescript
{
    actionType: 'extend',
    params: {
        baseConclusionId: "C-001",
        extension: "$x^2 + y^2 = z^2$",
        rule: "algebraic"
    }
}
```

### accept
接受某一结论：
```typescript
{
    actionType: 'accept',
    params: {
        proposalId: "C-003",
        verificationNote?: "已验证推导步骤正确"
    }
}
```

---

## RuleEngine 验证规则

| 检查项 | 说明 |
|--------|------|
| Agent 是研究员 | 必须注册 |
| 前提存在 | 必须在 hypotheses 或 conclusions |
| 结论非空 | LaTeX 不能为空 |
| 推导规则有效 | modus_ponens 需要 2 前提 |
| 反驳目标存在 | 在 conclusions 或 pending |

---

## Event Log 格式

### PROPOSAL
```json
{
    "eventType": "PROPOSAL",
    "source": "researcher-1",
    "content": {
        "proposalId": "C-001",
        "latex": "$a + b = c$",
        "premises": ["H-1", "H-2"],
        "rule": "algebraic"
    }
}
```

### ACCEPTED
```json
{
    "eventType": "ACCEPTED",
    "source": "system",
    "content": {
        "conclusionId": "C-001",
        "latex": "$a + b = c$",
        "derivedFrom": ["H-1", "H-2"],
        "rule": "algebraic",
        "proposedBy": "researcher-1",
        "verifiedBy": "researcher-2"
    }
}
```

### REJECTED
```json
{
    "eventType": "REJECTED",
    "source": "system",
    "content": {
        "proposalId": "C-002",
        "latex": "$x = y$",
        "reason": "前提 H-99 不存在",
        "refutedBy": "researcher-2"
    }
}
```

### CONTRADICTION
```json
{
    "eventType": "CONTRADICTION",
    "source": "researcher-2",
    "content": {
        "targetId": "C-003",
        "contradictionReason": "$C-003$ implies $\\neg H-1$, contradicting given hypothesis"
    }
}
```

---

## 完整推导示例

### 初始问题

```latex
\section*{问题}
证明: $a + b > 0$ 当 $a > 0$ 且 $b > 0$

\subsection*{假设}
\begin{itemize}
  \item (H-1) $a > 0$
  \item (H-2) $b > 0$
  \item (H-3) $\forall x, y > 0: x + y > 0$ (公理)
\end{itemize}

\subsection*{目标}
\begin{itemize}
  \item (G-1) $a + b > 0$
\end{itemize}
```

### 推导过程

**Round 1: Researcher-1 提出推导**
```
Action: derive
params:
  conclusion: "$a > 0 \\land b > 0$"
  premises: ["H-1", "H-2"]
  rule: "conjunction"
```

Event Log:
```json
{ "eventType": "PROPOSAL", "proposalId": "C-001", "latex": "$a > 0 \\land b > 0$" }
```

**Round 2: Researcher-2 接受**
```
Action: accept
params:
  proposalId: "C-001"
```

Event Log:
```json
{ "eventType": "ACCEPTED", "conclusionId": "C-001" }
```

**Round 3: Researcher-1 扩展**
```
Action: extend
params:
  baseConclusionId: "C-001"
  extension: "$a + b > 0$"
  rule: "modus_ponens"
  // 使用 H-3 公理
```

Event Log:
```json
{ "eventType": "PROPOSAL", "proposalId": "C-002", "latex": "$a + b > 0$" }
```

**Round 4: Researcher-2 接受并验证目标**
```
Action: accept
params:
  proposalId: "C-002"
```

Event Log:
```json
{ "eventType": "ACCEPTED", "conclusionId": "C-002" }
{ "eventType": "GOAL_PROVED", "goalId": "G-1", "proofConclusionId": "C-002" }
```

### 最终推导链

```json
[
    { "id": "C-001", "latex": "$a > 0 \\land b > 0$", "derivedFrom": ["H-1", "H-2"], "rule": "conjunction" },
    { "id": "C-002", "latex": "$a + b > 0$", "derivedFrom": ["C-001"], "rule": "modus_ponens" }
]
```

---

## 成功标准 ✅

| 标准 | 结果 |
|------|------|
| 多个 Agent 可接续推理 | ✅ Researcher-1 derive, Researcher-2 accept |
| 错误结论不污染 World State | ✅ pending → rejected，不进入 conclusions |
| 所有结论可从 Event Log 复原 | ✅ PROPOSAL + ACCEPTED 包含完整推导链 |

---

## 使用示例

```typescript
import { createLogicWorldEngine, Hypothesis, Goal } from './LogicWorldEngine';

// 定义问题
const hypotheses: Hypothesis[] = [
    { id: 'H-1', type: 'given', latex: 'a > 0', source: 'system' },
    { id: 'H-2', type: 'given', latex: 'b > 0', source: 'system' }
];

const goals: Goal[] = [
    { id: 'G-1', latex: 'a + b > 0', status: 'open', priority: 1 }
];

// 创建引擎
const engine = await createLogicWorldEngine(
    'prob-001',
    'Prove: a + b > 0',
    hypotheses,
    goals,
    ['researcher-1', 'researcher-2']
);

// 推理循环
while (!engine.isTerminated()) {
    // 收集 Agent Actions
    const actions = await collectResearcherActions();
    
    // 执行
    const results = await engine.step(actions);
    
    // 处理结果
    for (const result of results) {
        if (!result.success) {
            console.log('Rejected:', result.failureReason);
        }
    }
}

// 获取推导链
const chain = engine.getDerivationChain();
console.log('Proof:', chain);
```
