# 场景验证文档

本文档记录两个完整讨论场景的运行验证，展示所有模块如何正确串联。

## 模块调用链

```
┌─────────────────────┐
│  Scenario Config    │ ← YAML 配置
│  (demo_debate.yaml) │
└─────────┬───────────┘
          │ load()
          ▼
┌─────────────────────┐
│  DiscussionOrchest- │
│  rator              │
└─────────┬───────────┘
          │
    ┌─────┴──────────────────────────┐
    │                                │
    ▼                                ▼
┌─────────────┐             ┌─────────────────┐
│ Moderator   │             │   Agent         │
│ Controller  │◄───────────►│   Executor      │
│ (决策层)    │   intents   │   (LLM 生成)    │
└──────┬──────┘             └────────┬────────┘
       │                             │
       │ decision                    │ speech
       ▼                             ▼
┌────────────────────────────────────────────┐
│              Event Log                      │
│  (INTENT / SPEECH / SUMMARY / SYSTEM)       │
└─────────────────────────────────────────────┘
       │
       │ (如果需要语言)
       ▼
┌─────────────────┐
│  Moderator LLM  │ ← 只生成文本
│  (语言表达层)   │
└─────────────────┘
```

---

## 场景 1：正式辩论（Debate）

### YAML 配置摘要

```yaml
id: demo_debate
name: 远程办公辩论

alignment:
  type: opposing
  factions:
    - id: pro    # 正方
    - id: con    # 反方

flow:
  phases:
    - id: opening           # maxRounds: 2
    - id: free_discussion   # maxRounds: 6, allowInterrupt: true
    - id: focused_conflict  # maxRounds: 4
    - id: closing           # maxRounds: 2

moderatorPolicy:
  interventionLevel: 2
  forceSummaryEachPhase: true
```

### Agent 定义

| ID | 姓名 | 阵营 | 说话风格 |
|----|------|------|----------|
| pro-1 | 李明 | 正方 | analytical |
| pro-2 | 王芳 | 正方 | diplomatic |
| con-1 | 张强 | 反方 | aggressive |
| con-2 | 陈华 | 反方 | analytical |

### 讨论运行流程

```
第 1 轮 (Phase: opening)
├── 所有 Agent 生成 INTENT
├── Controller 决策: ALLOW_SPEECH → pro-1
├── pro-1 生成 SPEECH
└── 写入 Event Log

第 2 轮 (Phase: opening)
├── pro-1 刚说完，被 MAX_CONSECUTIVE_SPEAKS 过滤
├── Controller 决策: ALLOW_SPEECH → con-1
├── con-1 生成 SPEECH
└── 写入 Event Log

第 3 轮 (Phase: opening)
├── phaseRound >= maxRounds
├── Controller 决策: FORCE_SUMMARY
├── Moderator LLM 生成 Summary
├── 写入 SUMMARY 事件
└── Controller 决策: SWITCH_PHASE → free_discussion

第 4-8 轮 (Phase: free_discussion)
├── allowInterrupt: true
├── con-2 提交 interrupt 意图 (urgency=4)
├── Controller 决策: ALLOW_SPEECH (interrupt)
├── 主持人 idleRounds >= 2 时 CALL_AGENT
└── ...

第 9 轮 (Phase: free_discussion)
├── phaseRound >= maxRounds
├── Controller 决策: FORCE_SUMMARY
└── SWITCH_PHASE → focused_conflict

...

最终轮 (Phase: closing)
├── 所有阶段完成
└── Controller 决策: END_DISCUSSION
```

### 关键 Event Log 示例

```json
[
  {
    "eventId": "evt-001",
    "type": "INTENT",
    "speaker": "pro-1",
    "content": "{\"type\":\"INTENT\",\"intent\":\"speak\",\"urgency\":4,\"topic\":\"远程协作效率\"}",
    "timestamp": "2024-01-15T10:00:01Z",
    "meta": { "urgency": 4 }
  },
  {
    "eventId": "evt-002",
    "type": "SPEECH",
    "speaker": "pro-1",
    "content": "各位好，我认为远程办公能够显著提高工作效率。根据我们团队的数据，远程工作后代码提交量提高了15%...",
    "timestamp": "2024-01-15T10:00:05Z",
    "meta": { "tone": "analytical" }
  },
  {
    "eventId": "evt-003",
    "type": "SYSTEM",
    "speaker": "moderator",
    "content": "主持人点名 con-2：请发表您的观点",
    "timestamp": "2024-01-15T10:01:30Z",
    "meta": { "action": "call_agent", "targetAgentId": "con-2" }
  },
  {
    "eventId": "evt-004",
    "type": "SUMMARY",
    "speaker": "moderator",
    "content": "本阶段讨论围绕协作效率展开。正方认为远程协作工具可以弥补效率损失，反方强调面对面沟通的重要性。",
    "timestamp": "2024-01-15T10:05:00Z",
    "meta": {
      "phaseId": "free_discussion",
      "consensusHighlights": ["工具支持是基础"],
      "divergenceHighlights": ["效率问题", "沟通质量"]
    }
  },
  {
    "eventId": "evt-005",
    "type": "SYSTEM",
    "speaker": "system",
    "content": "阶段切换：进入 focused_conflict",
    "timestamp": "2024-01-15T10:05:01Z",
    "meta": {
      "action": "phase_switch",
      "fromPhaseId": "free_discussion",
      "toPhaseId": "focused_conflict"
    }
  }
]
```

### 结果说明

| 验证项 | 结果 |
|--------|------|
| 辩论是否形成清晰对立 | ✅ 正反双方均有发言，立场明确 |
| 是否发生插话 (interrupt) | ✅ free_discussion 阶段允许插话 |
| 是否有主持人点名 | ✅ interventionLevel=2 时点名 |
| 是否有阶段总结 | ✅ forceSummaryEachPhase=true |
| 主持人像主持人 | ✅ 只做调度，不参与辩论内容 |

---

## 场景 2：项目讨论会（Project Review）

### YAML 配置摘要

```yaml
id: demo_project_review
name: 新功能技术方案讨论

alignment:
  type: free   # 无对立阵营

flow:
  phases:
    - id: problem_definition  # maxRounds: 3
    - id: option_discussion   # maxRounds: 8, endCondition: moderator_decision
    - id: convergence         # maxRounds: 4, endCondition: consensus
    - id: decision            # maxRounds: 2

moderatorPolicy:
  interventionLevel: 3   # 高度干预
  forceSummaryEachPhase: true
```

### Agent 定义

| ID | 姓名 | 角色 | 说话风格 |
|----|------|------|----------|
| pm | 小刘 | 项目经理 | concise |
| tech-lead | 老王 | 技术负责人 | analytical |
| security | 小张 | 安全专家 | elaborate |
| product | 小李 | 产品经理 | emotional |

### 讨论运行流程

```
第 1-3 轮 (Phase: problem_definition)
├── 主持人开场
├── 各角色轮流发言定义问题
├── 生成 SUMMARY: 问题定义
└── SWITCH_PHASE → option_discussion

第 4-11 轮 (Phase: option_discussion)
├── interventionLevel=3: 主持人主动提问
├── 各角色提出不同方案
├── 技术/安全/产品角度分析
├── 生成 SUMMARY: 方案评估
└── SWITCH_PHASE → convergence

第 12-15 轮 (Phase: convergence)
├── speakingOrder: moderated
├── 主持人引导聚焦
├── 逐步收敛到共识
├── 生成 Decision SUMMARY
└── SWITCH_PHASE → decision

第 16-17 轮 (Phase: decision)
├── 确认最终方案
├── 生成 Final SUMMARY
└── END_DISCUSSION
```

### 关键 Event Log 示例

```json
[
  {
    "eventId": "evt-101",
    "type": "SYSTEM",
    "speaker": "moderator",
    "content": "能否请技术负责人具体说明方案 A 的技术可行性？",
    "timestamp": "2024-01-15T14:05:00Z",
    "meta": { "action": "question", "questionType": "directed" }
  },
  {
    "eventId": "evt-102",
    "type": "SPEECH",
    "speaker": "tech-lead",
    "content": "从技术角度来看，方案 A 需要约两周开发时间，主要工作包括...",
    "timestamp": "2024-01-15T14:05:30Z",
    "meta": { "tone": "analytical" }
  },
  {
    "eventId": "evt-103",
    "type": "SPEECH",
    "speaker": "security",
    "content": "安全方面，方案 A 需要注意以下几点：首先是认证令牌的存储...",
    "timestamp": "2024-01-15T14:06:00Z",
    "meta": { "tone": "elaborate" }
  },
  {
    "eventId": "evt-104",
    "type": "SUMMARY",
    "speaker": "moderator",
    "content": "经过讨论，团队倾向于采用方案 A。技术可行、安全风险可控、用户体验好。建议两周内完成第一版实现。",
    "timestamp": "2024-01-15T14:30:00Z",
    "meta": {
      "phaseId": "convergence",
      "consensusHighlights": [
        "采用方案 A",
        "两周完成第一版"
      ],
      "divergenceHighlights": [],
      "nextStepsSuggestion": "技术负责人拆解任务"
    }
  }
]
```

### 结果说明

| 验证项 | 结果 |
|--------|------|
| 讨论是否成功收敛 | ✅ 从多方案讨论到最终决策 |
| 是否有决策型 SUMMARY | ✅ convergence 阶段产出 |
| 各角色是否都发言 | ✅ PM/Tech/Security/Product |
| 主持人像主持人 | ✅ 引导节奏，不表达技术意见 |

---

## 验收标准

### ✅ "换一份 YAML，系统还能正常跑"

```typescript
// 只需修改场景 ID
const session = await orchestrator.createSession('new_scenario', agents);

// 系统自动适配：
// - Phase 数量和顺序
// - intervention 策略
// - speaking order
// - interrupt 规则
```

### ✅ 模块边界正确

| 模块 | 职责边界 |
|------|----------|
| Scenario Config | 只提供配置，不执行逻辑 |
| Event Log | 只存储事件，不做判断 |
| Moderator Controller | 只做决策，不生成语言 |
| Agent Executor | 只生成内容，不做调度 |
| Moderator LLM | 只生成语言，不做决策 |
| Orchestrator | 只串联模块，不增加逻辑 |

### ✅ 事件驱动

所有交互通过 Event Log 流转，无"对话文本串"直接拼接。
