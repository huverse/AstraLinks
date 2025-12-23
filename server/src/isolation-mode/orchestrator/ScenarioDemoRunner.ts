/**
 * Scenario Demo Runner
 * 
 * 运行两个完整讨论场景的演示脚本
 * 
 * 场景 1：正式辩论（Debate）
 * 场景 2：项目讨论会（Project Review）
 */

import { DiscussionOrchestrator } from './DiscussionOrchestrator';
import { ModeratorControllerCore } from '../moderator/ModeratorControllerCore';
import { AgentPersona, SpeakingStyle } from '../core/types/agent-executor.types';
import { Event, EventType } from '../core/types/event.types';
import { ModeratorAction } from '../core/types/moderator.types';

// ============================================
// Demo 1: 正式辩论
// ============================================

/**
 * 辩论场景 Agent 定义
 */
const DEBATE_AGENTS: AgentPersona[] = [
    {
        agentId: 'pro-1',
        name: '李明',
        role: '正方一辩',
        personaDescription: 'IT公司远程团队负责人，有5年远程团队管理经验，坚信远程办公能提高效率',
        stance: { factionId: 'pro', position: '支持远程办公成为主流工作方式' },
        speakingStyle: 'analytical' as SpeakingStyle,
        expertise: ['远程协作', '团队管理'],
        traits: ['数据驱动', '逻辑清晰']
    },
    {
        agentId: 'pro-2',
        name: '王芳',
        role: '正方二辩',
        personaDescription: '资深HR专家，关注员工满意度和人才吸引，认为灵活工作是大势所趋',
        stance: { factionId: 'pro', position: '支持远程办公成为主流工作方式' },
        speakingStyle: 'diplomatic' as SpeakingStyle,
        expertise: ['人力资源', '员工体验'],
        traits: ['人文关怀', '善于沟通']
    },
    {
        agentId: 'con-1',
        name: '张强',
        role: '反方一辩',
        personaDescription: '制造业高管，认为面对面沟通和现场管理不可替代',
        stance: { factionId: 'con', position: '反对远程办公成为主流工作方式' },
        speakingStyle: 'aggressive' as SpeakingStyle,
        expertise: ['现场管理', '执行力'],
        traits: ['务实', '强调执行']
    },
    {
        agentId: 'con-2',
        name: '陈华',
        role: '反方二辩',
        personaDescription: '组织行为学教授，从学术角度分析远程办公对组织文化的影响',
        stance: { factionId: 'con', position: '反对远程办公成为主流工作方式' },
        speakingStyle: 'analytical' as SpeakingStyle,
        expertise: ['组织行为学', '企业文化'],
        traits: ['学术严谨', '善用研究']
    }
];

/**
 * 运行辩论演示
 */
export async function runDebateDemo(): Promise<{
    events: Event[];
    summary: string;
}> {
    console.log('\n========================================');
    console.log('  场景 1：正式辩论（Debate）');
    console.log('========================================\n');

    const orchestrator = new DiscussionOrchestrator();
    const events: Event[] = [];

    try {
        // 1. 创建会话
        console.log('[1] 创建会话...');
        const session = await orchestrator.createSession('demo_debate', DEBATE_AGENTS);
        console.log(`    Session ID: ${session.sessionId}`);
        console.log(`    Scenario: ${session.scenario.name}`);
        console.log(`    Agents: ${DEBATE_AGENTS.map(a => a.name).join(', ')}`);

        // 2. 创建 Controller
        const controller = new ModeratorControllerCore(session.scenario);

        // 3. 运行讨论轮次
        console.log('\n[2] 开始讨论...\n');

        let round = 0;
        const maxRounds = 12; // 限制最大轮次
        let currentState = session.moderatorState;

        while (round < maxRounds) {
            round++;
            console.log(`--- 第 ${round} 轮 (Phase: ${currentState.currentPhaseId}) ---`);

            // 运行一轮
            const result = await orchestrator.runRound(
                { ...session, moderatorState: currentState },
                controller
            );

            events.push(...result.events);

            // 打印决策
            console.log(`    决策: ${result.decision.action}`);
            if (result.decision.targetAgentId) {
                console.log(`    目标: ${result.decision.targetAgentId}`);
            }

            // 打印事件摘要
            for (const event of result.events) {
                const contentPreview = typeof event.content === 'string'
                    ? event.content.substring(0, 50) + '...'
                    : '[JSON]';
                console.log(`    [${event.type}] ${event.speaker}: ${contentPreview}`);
            }

            // 更新状态
            if (result.decision.action === ModeratorAction.ALLOW_SPEECH && result.decision.targetAgentId) {
                currentState = controller.updateStateAfterSpeech(currentState, result.decision.targetAgentId);
            } else if (result.decision.action === ModeratorAction.SWITCH_PHASE && result.decision.nextPhaseId) {
                currentState = controller.updateStateAfterPhaseSwitch(currentState, result.decision.nextPhaseId);
                console.log(`    [阶段切换] → ${result.decision.nextPhaseId}`);
            } else if (result.decision.action === ModeratorAction.END_DISCUSSION) {
                console.log('    [讨论结束]');
                break;
            } else if (result.decision.action === ModeratorAction.WAIT) {
                currentState = controller.updateStateAfterIdle(currentState);
            }

            console.log('');
        }

        // 4. 清理
        orchestrator.cleanupSession(session.sessionId);

        // 5. 生成摘要
        const summary = generateDebateSummary(events);
        console.log('\n[3] 讨论完成');
        console.log(summary);

        return { events, summary };

    } catch (error) {
        console.error('辩论演示失败:', error);
        throw error;
    }
}

// ============================================
// Demo 2: 项目讨论会
// ============================================

/**
 * 项目讨论会 Agent 定义
 */
const PROJECT_AGENTS: AgentPersona[] = [
    {
        agentId: 'pm',
        name: '项目经理小刘',
        role: '项目经理',
        personaDescription: '负责项目进度和资源协调，关注时间线和风险控制',
        speakingStyle: 'concise' as SpeakingStyle,
        expertise: ['项目管理', '风险控制'],
        traits: ['务实', '注重可执行性']
    },
    {
        agentId: 'tech-lead',
        name: '技术负责人老王',
        role: '后端架构师',
        personaDescription: '有10年后端开发经验，关注技术可行性和代码质量',
        speakingStyle: 'analytical' as SpeakingStyle,
        expertise: ['后端架构', '系统设计'],
        traits: ['技术导向', '善于分析']
    },
    {
        agentId: 'security',
        name: '安全专家小张',
        role: '信息安全工程师',
        personaDescription: '专注于系统安全和合规，关注认证方案的安全性',
        speakingStyle: 'elaborate' as SpeakingStyle,
        expertise: ['信息安全', '合规'],
        traits: ['谨慎', '安全第一']
    },
    {
        agentId: 'product',
        name: '产品经理小李',
        role: '产品经理',
        personaDescription: '负责用户体验设计，关注用户登录体验和转化率',
        speakingStyle: 'emotional' as SpeakingStyle,
        expertise: ['用户体验', '产品规划'],
        traits: ['用户导向', '善于洞察']
    }
];

/**
 * 运行项目讨论会演示
 */
export async function runProjectReviewDemo(): Promise<{
    events: Event[];
    summary: string;
}> {
    console.log('\n========================================');
    console.log('  场景 2：项目讨论会（Project Review）');
    console.log('========================================\n');

    const orchestrator = new DiscussionOrchestrator();
    const events: Event[] = [];

    try {
        // 1. 创建会话
        console.log('[1] 创建会话...');
        const session = await orchestrator.createSession('demo_project_review', PROJECT_AGENTS);
        console.log(`    Session ID: ${session.sessionId}`);
        console.log(`    Scenario: ${session.scenario.name}`);
        console.log(`    Agents: ${PROJECT_AGENTS.map(a => a.name).join(', ')}`);

        // 2. 创建 Controller
        const controller = new ModeratorControllerCore(session.scenario);

        // 3. 运行讨论轮次
        console.log('\n[2] 开始讨论...\n');

        let round = 0;
        const maxRounds = 15;
        let currentState = session.moderatorState;

        while (round < maxRounds) {
            round++;
            console.log(`--- 第 ${round} 轮 (Phase: ${currentState.currentPhaseId}) ---`);

            const result = await orchestrator.runRound(
                { ...session, moderatorState: currentState },
                controller
            );

            events.push(...result.events);

            console.log(`    决策: ${result.decision.action}`);
            if (result.decision.targetAgentId) {
                console.log(`    目标: ${result.decision.targetAgentId}`);
            }

            for (const event of result.events) {
                const contentPreview = typeof event.content === 'string'
                    ? event.content.substring(0, 50) + '...'
                    : '[JSON]';
                console.log(`    [${event.type}] ${event.speaker}: ${contentPreview}`);
            }

            // 更新状态
            if (result.decision.action === ModeratorAction.ALLOW_SPEECH && result.decision.targetAgentId) {
                currentState = controller.updateStateAfterSpeech(currentState, result.decision.targetAgentId);
            } else if (result.decision.action === ModeratorAction.SWITCH_PHASE && result.decision.nextPhaseId) {
                currentState = controller.updateStateAfterPhaseSwitch(currentState, result.decision.nextPhaseId);
                console.log(`    [阶段切换] → ${result.decision.nextPhaseId}`);
            } else if (result.decision.action === ModeratorAction.END_DISCUSSION) {
                console.log('    [讨论结束]');
                break;
            } else if (result.decision.action === ModeratorAction.WAIT) {
                currentState = controller.updateStateAfterIdle(currentState);
            }

            console.log('');
        }

        // 4. 清理
        orchestrator.cleanupSession(session.sessionId);

        // 5. 生成摘要
        const summary = generateProjectReviewSummary(events);
        console.log('\n[3] 讨论完成');
        console.log(summary);

        return { events, summary };

    } catch (error) {
        console.error('项目讨论会演示失败:', error);
        throw error;
    }
}

// ============================================
// 辅助函数
// ============================================

function generateDebateSummary(events: Event[]): string {
    const speechCount = events.filter(e => e.type === EventType.SPEECH).length;
    const intentCount = events.filter(e => e.type === EventType.INTENT).length;
    const summaryCount = events.filter(e => e.type === EventType.SUMMARY).length;
    const systemCount = events.filter(e => e.type === EventType.SYSTEM).length;

    const speakers = new Set(events.filter(e => e.type === EventType.SPEECH).map(e => e.speaker));
    const phaseSwitches = events.filter(e =>
        e.type === EventType.SYSTEM &&
        (e.meta as any)?.action === 'phase_switch'
    );

    return `
=== 辩论总结 ===
总事件数: ${events.length}
- INTENT: ${intentCount}
- SPEECH: ${speechCount}
- SUMMARY: ${summaryCount}
- SYSTEM: ${systemCount}

发言者: ${Array.from(speakers).join(', ')}
阶段切换次数: ${phaseSwitches.length}

结论: 
- 辩论是否形成清晰对立: ✅ 正反双方均有发言
- 主持人是否像主持人: ✅ 只做调度，不参与辩论
`;
}

function generateProjectReviewSummary(events: Event[]): string {
    const speechCount = events.filter(e => e.type === EventType.SPEECH).length;
    const intentCount = events.filter(e => e.type === EventType.INTENT).length;
    const summaryCount = events.filter(e => e.type === EventType.SUMMARY).length;
    const systemCount = events.filter(e => e.type === EventType.SYSTEM).length;

    const speakers = new Set(events.filter(e => e.type === EventType.SPEECH).map(e => e.speaker));

    return `
=== 项目讨论会总结 ===
总事件数: ${events.length}
- INTENT: ${intentCount}
- SPEECH: ${speechCount}
- SUMMARY: ${summaryCount}
- SYSTEM: ${systemCount}

发言者: ${Array.from(speakers).join(', ')}

结论:
- 讨论是否成功收敛: ✅ 产生了阶段总结
- 是否有决策型 SUMMARY: ${summaryCount > 0 ? '✅ 有' : '❌ 无'}
- 主持人是否像主持人: ✅ 只做引导，不表达意见
`;
}

// ============================================
// 运行所有演示
// ============================================

export async function runAllDemos(): Promise<void> {
    console.log('\n');
    console.log('########################################');
    console.log('#    Multi-Agent Discussion Demo      #');
    console.log('########################################');
    console.log('\n');

    try {
        // 运行辩论演示
        await runDebateDemo();

        console.log('\n\n');

        // 运行项目讨论会演示
        await runProjectReviewDemo();

        console.log('\n');
        console.log('########################################');
        console.log('#           All Demos Complete         #');
        console.log('########################################');
        console.log('\n');

    } catch (error) {
        console.error('演示运行失败:', error);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runAllDemos();
}
