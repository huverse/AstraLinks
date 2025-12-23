# World Engine 架构文档

## 整体架构说明

World Engine 是系统内核，负责：
- 决定世界"允许发生什么"
- 推进时间 / 回合 / 状态
- 裁决多个 Agent 的 Action 冲突
- 将结果写入 Event Log

### 核心特性

| 特性 | 说明 |
|------|------|
| 确定性 | 相同输入 → 相同输出 |
| 无 LLM 依赖 | 规则全部硬编码 |
| 可扩展 | 支持辩论、游戏、社会仿真等 |
| 向后兼容 | 现有辩论场景零改动运行 |

### 架构图

```
                    ┌─────────────────────────────┐
                    │       World Engine          │
                    │  ┌──────────────────────┐   │
 Agent Actions ────▶│  │      Arbiter         │   │
                    │  │   (冲突裁决)          │   │
                    │  └──────────┬───────────┘   │
                    │             │               │
                    │  ┌──────────▼───────────┐   │
                    │  │    Rule Engine       │   │
                    │  │  (验证 + 应用规则)    │   │
                    │  └──────────┬───────────┘   │
                    │             │               │
                    │  ┌──────────▼───────────┐   │
                    │  │     Scheduler        │   │
                    │  │  (时间 + 阶段推进)    │   │
                    │  └──────────┬───────────┘   │
                    │             │               │
                    │  ┌──────────▼───────────┐   │
                    │  │    World State       │   │
                    │  │  (世界事实)           │   │
                    └──┴──────────────────────┴───┘
                              │
                              ▼
                    ┌─────────────────────────────┐
                    │        Event Log            │
                    └─────────────────────────────┘
                              │
                              ▼ (如需语言)
                    ┌─────────────────────────────┐
                    │        Narrator             │
                    │      (LLM 生成)              │
                    └─────────────────────────────┘
```

## 核心组件

### 1. IWorldEngine

```typescript
interface IWorldEngine {
    initialize(config: WorldConfig): Promise<void>;
    step(agentActions: Action[]): Promise<ActionResult[]>;
    getWorldState(): WorldState;
    isTerminated(): boolean;
}
```

### 2. IRuleEngine

```typescript
interface IRuleEngine {
    validateAction(action: Action, worldState: WorldState): ValidationResult;
    applyAction(action: Action, worldState: WorldState): ActionResult;
    enforceConstraints(worldState: WorldState): WorldStateChange[];
}
```

### 3. IScheduler

```typescript
interface IScheduler {
    nextTick(): WorldTime;
    currentTime(): WorldTime;
    shouldAdvancePhase(worldState: WorldState): boolean;
    getNextPhase(currentPhaseId: string): PhaseConfig | null;
}
```

### 4. IArbiter

```typescript
interface IArbiter {
    resolveConflicts(actions: Action[], worldState: WorldState): Action[];
    prioritizeActions(actions: Action[]): Action[];
}
```

### 5. INarrator (可选，LLM)

```typescript
interface INarrator {
    generateSummary(worldState: WorldState, recentEvents: WorldEvent[]): Promise<string>;
    narrateEvent(event: WorldEvent): Promise<string>;
}
```

---

## WorldState 设计

### 世界事实 vs Agent Memory

| 类别 | 属于 WorldState | 属于 Agent Memory |
|------|-----------------|-------------------|
| 当前阶段 | ✅ | ❌ |
| Agent 位置 | ✅ | ❌ |
| 资源余量 | ✅ | ❌ |
| Agent 关系 | ✅ | ❌ |
| Agent 内心想法 | ❌ | ✅ |
| Agent 策略 | ❌ | ✅ |
| Agent 短期记忆 | ❌ | ✅ |

**World Engine 只能读写 World State，不能读写 Agent Memory。**

### WorldState 接口示例

```typescript
interface WorldState {
    worldId: string;
    worldType: 'debate' | 'game' | 'social_sim' | 'creative';
    currentTime: WorldTime;
    currentPhase: PhaseState;
    entities: Map<string, Entity>;         // Agent、物品、位置
    relationships: Relationship[];          // Agent 之间的关系
    resources: Map<string, Resource>;       // 资源
    globalVars: Map<string, unknown>;       // 全局变量
    isTerminated: boolean;
}
```

---

## Action 抽象

### 通用 Action 模型

```typescript
interface Action {
    actionId: string;
    agentId: string;
    actionType: ActionType;
    params: Record<string, unknown>;
    confidence: number;  // 0.0-1.0
    timestamp: number;
    target?: ActionTarget;
    priority?: number;   // 1-10
}
```

### Action 类型映射

#### 辩论 Action 映射

| 原本 | Action 模型 |
|------|-------------|
| `INTENT(speak)` | `{ actionType: 'speak', params: { topic } }` |
| `INTENT(interrupt)` | `{ actionType: 'interrupt', priority: 8 }` |
| `INTENT(question)` | `{ actionType: 'question', target: agentId }` |
| `INTENT(respond)` | `{ actionType: 'respond', target: agentId }` |
| `INTENT(pass)` | `{ actionType: 'pass' }` |

#### 游戏 Action 映射

```typescript
// 移动
{ actionType: 'move', params: { x: 10, y: 5 }, target: { type: 'location', id: 'zone-1' } }

// 攻击
{ actionType: 'attack', params: { damage: 50 }, target: { type: 'agent', id: 'enemy-1' } }

// 出牌
{ actionType: 'play_card', params: { cardId: 'card-123', effect: 'draw' } }
```

#### 推理 Action 映射

```typescript
// 研究
{ actionType: 'research', params: { topic: 'quantum physics', depth: 'deep' } }

// 写作
{ actionType: 'write_text', params: { style: 'academic', length: 500 } }
```

#### 社会仿真 Action 映射

```typescript
// 社交
{ actionType: 'socialize', target: { type: 'agent', id: 'friend-1' }, params: { mood: 'friendly' } }

// 工作
{ actionType: 'work', params: { hours: 8, productivity: 0.8 } }
```

---

## 向后兼容

### ModeratorController 作为 WorldEngine 实现

```
┌─────────────────────────────────────────────────────┐
│             DebateWorldEngine                        │
│  ┌─────────────────────────────────────────────┐    │
│  │           DebateRuleEngine                   │    │
│  │  ┌───────────────────────────────────────┐  │    │
│  │  │       ModeratorControllerCore          │  │    │
│  │  │         (原有逻辑完全保留)              │  │    │
│  │  └───────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 适配器转换函数

```typescript
// Intent → Action
function intentToAction(intent: Intent): Action {
    return {
        actionId: uuidv4(),
        agentId: intent.agentId,
        actionType: intent.type,
        params: { topic: intent.topic, targetAgentId: intent.targetAgentId },
        confidence: intent.urgency / 5,
        timestamp: intent.timestamp,
        priority: intent.urgency
    };
}

// Action → Intent
function actionToIntent(action: Action): Intent {
    return {
        agentId: action.agentId,
        type: action.actionType as Intent['type'],
        urgency: Math.round(action.confidence * 5),
        topic: action.params.topic,
        targetAgentId: action.params.targetAgentId,
        timestamp: action.timestamp
    };
}

// ScenarioSchema → WorldConfig
function scenarioToWorldConfig(scenario: ScenarioSchema): WorldConfig {
    return {
        worldId: scenario.id,
        worldType: 'debate',
        phases: scenario.flow.phases.map(...),
        extensions: { scenario }
    };
}
```

### 迁移方式

```typescript
// 旧代码
const controller = new ModeratorControllerCore(scenario);
const state = controller.createInitialState(agentIds);
const decision = controller.decideNextAction(state, intents, events);

// 新代码（完全兼容）
const engine = createDebateWorldEngine(scenario, agentIds);
const results = await engine.step(actions);

// 或者继续使用旧代码（零改动）
```

---

## 极简 World Engine 示例

```typescript
class SimpleWorldEngine extends BaseWorldEngine {
    readonly name = 'SimpleWorldEngine';

    protected createInitialState(config: WorldConfig): WorldState {
        return {
            worldId: config.worldId,
            worldType: 'custom',
            currentTime: { tick: 0, round: 0, timeScale: 1 },
            currentPhase: {
                phaseId: 'main',
                phaseType: 'default',
                phaseRound: 0,
                phaseMaxRounds: 10,
                startedAt: Date.now(),
                phaseRules: {}
            },
            entities: new Map(),
            relationships: [],
            resources: new Map(),
            globalVars: new Map(),
            ruleStates: new Map(),
            isTerminated: false
        };
    }
}

// 使用
const engine = new SimpleWorldEngine();
await engine.initialize({
    worldId: 'simple-world',
    worldType: 'custom',
    phases: [{ id: 'main', type: 'default', name: 'Main', maxRounds: 10, ... }],
    rules: [],
    terminationConditions: [{ type: 'max_rounds', params: { maxRounds: 10 } }]
});

// 运行
while (!engine.isTerminated()) {
    const actions = await collectAgentActions();
    const results = await engine.step(actions);
    processResults(results);
}
```

---

## 设计标准：未来 5 年扩展能力

| 场景类型 | WorldEngine 实现 | 备注 |
|----------|------------------|------|
| 辩论/讨论 | DebateWorldEngine | ✅ 已实现 |
| 回合制游戏 | TurnBasedGameEngine | 继承 BaseWorldEngine |
| 实时游戏 | RealtimeGameEngine | 重写 Scheduler |
| 社会仿真 | SocialSimEngine | 扩展 Relationship |
| 创意生成 | CreativeEngine | 集成 Narrator |
| 推理任务 | ResearchEngine | 扩展 Action 类型 |

**只需实现 `createInitialState()` 和重写部分方法即可。**
