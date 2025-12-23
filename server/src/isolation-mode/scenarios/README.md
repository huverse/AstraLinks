# 讨论场景配置系统

## 概述

讨论场景配置系统允许通过 YAML 文件定义讨论"玩法"，而不需要修改代码。

**核心设计目标**：
- 讨论"玩法"必须是配置问题
- 新增场景 ≠ 新写逻辑  
- Moderator / Agent 的行为由配置约束
- 策划只改 YAML、不改代码

## 配置维度

### 1️⃣ alignment（阵营结构）

| 类型 | 说明 | 示例 |
|------|------|------|
| `opposing` | 正反方 | 辩论 |
| `free` | 无阵营 | 头脑风暴 |
| `multi-faction` | 多阵营 | 多方谈判 |

```yaml
alignment:
  type: opposing
  factions:
    - id: pro
      name: 正方
      description: 支持论题的一方
    - id: con
      name: 反方
      description: 反对论题的一方
```

### 2️⃣ flow（讨论流程）

讨论由多个 Phase（阶段）组成：

| Phase 类型 | 说明 |
|------------|------|
| `opening` | 开场 |
| `position_statement` | 立场陈述 |
| `free_discussion` | 自由讨论 |
| `focused_conflict` | 焦点对抗 |
| `convergence` | 收敛共识 |
| `voting` | 投票 |
| `closing` | 闭幕 |

每个 Phase 必须包含：

```yaml
- id: free_discussion
  type: free_discussion
  name: 自由辩论
  description: 双方自由交锋
  maxRounds: 8
  allowInterrupt: true
  speakingOrder: free  # round-robin | free | moderated
  endCondition: max_rounds  # max_rounds | moderator_decision | consensus | timeout
```

### 3️⃣ moderatorPolicy（主持人策略）

```yaml
moderatorPolicy:
  interventionLevel: 2  # 0=不干预, 1=低, 2=中, 3=高
  coldThreshold: 30     # 秒，冷场检测
  maxIdleRounds: 2      # 最大空闲轮次
  forceSummaryEachPhase: true
  biasAllowed: false    # 主持人是否可以表达倾向
```

## 配置影响映射

| 配置字段 | 影响模块 | 影响行为 |
|----------|----------|----------|
| `alignment.type` | Agent Controller | 阵营分配、发言约束 |
| `flow.phases[].maxRounds` | Moderator Controller | 阶段结束判断 |
| `flow.phases[].allowInterrupt` | Agent Controller | 是否可以打断 |
| `flow.phases[].speakingOrder` | Moderator Controller | 选择发言者逻辑 |
| `moderatorPolicy.interventionLevel` | Moderator LLM | 干预频率和力度 |
| `moderatorPolicy.forceSummaryEachPhase` | Moderator LLM | 是否自动生成总结 |
| `moderatorPolicy.biasAllowed` | Moderator LLM | 总结内容中立性约束 |

## 使用方法

```typescript
import { scenarioConfigLoader } from './scenarios';

// 加载场景
const scenario = await scenarioConfigLoader.load('formal_debate');

// 获取可用场景列表
const available = scenarioConfigLoader.listAvailable();
```

## 校验规则

加载器会自动校验：

1. **必填字段**：id, name, description, version, alignment, flow, moderatorPolicy
2. **阵营合法性**：opposing 必须有且只有 2 个 factions
3. **Phase 顺序**：opening 必须在第一个，closing 必须在最后
4. **数值范围**：interventionLevel 必须是 0-3
5. **依赖关系**：endCondition=timeout 时必须有 timeout 字段

错误报告示例：

```
Invalid scenario configuration:
  - flow.phases[2].maxRounds: Must be a positive integer
  - moderatorPolicy.interventionLevel: Must be an integer between 0 and 3
  - alignment.factions: Opposing alignment requires exactly 2 factions
```

## 预置场景

| 场景 | 文件 | 阵营 | 特点 |
|------|------|------|------|
| 正式辩论 | `formal_debate.scenario.yaml` | opposing | 立论→对抗→总结，中度干预 |
| 项目讨论会 | `project_meeting.scenario.yaml` | free | 收敛共识，高度干预，决策输出 |
