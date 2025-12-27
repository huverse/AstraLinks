/**
 * 隔离模式容器组件
 *
 * 多 Agent 结构化讨论的主界面
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    FlaskConical, Users, Play, Pause, Square,
    History, ChevronLeft, Plus, RefreshCw, Wifi, WifiOff, Loader2
} from 'lucide-react';
import { API_BASE } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { encryptLlmConfig, LlmConfigData } from '../../utils/isolationCrypto';
import { Participant } from '../../types';
import { useIsolationSession } from '../../hooks/useIsolationSession';
import { isolationLogger } from '../../utils/logger';
import { Agent, Session, Scenario, DiscussionEvent, DEFAULT_SCENARIOS } from './types';
import { AgentCard } from './AgentCard';
import { EventTimeline } from './EventTimeline';
import { ScenarioSelector } from './ScenarioSelector';
import { AgentConfigPanel } from './AgentConfigPanel';

interface IsolationModeContainerProps {
    onExit: () => void;
    participants?: Participant[];
}

const IsolationModeContainer: React.FC<IsolationModeContainerProps> = ({ onExit, participants = [] }) => {
    const { token } = useAuth();
    const [view, setView] = useState<'setup' | 'discussion' | 'history'>('setup');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 场景
    const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
    const [scenarioLoading, setScenarioLoading] = useState(false);
    const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

    // Agent 配置
    const [configuredAgents, setConfiguredAgents] = useState<Agent[]>([
        { id: 'agent-1', name: '正方', role: 'debater', status: 'idle', speakCount: 0, systemPrompt: '你是正方辩手，需要支持讨论主题中的观点。', stance: 'for', agentLlmConfig: { useSessionConfig: true, configSource: 'session' } },
        { id: 'agent-2', name: '反方', role: 'debater', status: 'idle', speakCount: 0, systemPrompt: '你是反方辩手，需要反对讨论主题中的观点。', stance: 'against', agentLlmConfig: { useSessionConfig: true, configSource: 'session' } },
    ]);

    // 会话
    const [currentSession, setCurrentSession] = useState<Session | null>(null);
    const [topic, setTopic] = useState('');

    // 会话历史
    const [sessions, setSessions] = useState<Session[]>([]);

    // Socket 连接管理 (使用 Hook)
    const {
        connected: socketConnected,
        reconnecting,
        reconnectAttempts,
        joinSession: socketJoinSession,
    } = useIsolationSession({
        token,
        onWorldEvent: (event) => {
            setCurrentSession(prev => {
                if (!prev || event.sessionId !== prev.id) return prev;
                const newEvent: DiscussionEvent = {
                    id: event.eventId,
                    type: event.type,
                    sourceId: (event.payload as Record<string, unknown>)?.speaker as string || 'system',
                    timestamp: Date.now(),
                    sequence: event.tick,
                    payload: event.payload as { content?: string; message?: string }
                };
                return { ...prev, events: [...prev.events, newEvent] };
            });
        },
        onStateUpdate: (state) => {
            setCurrentSession(prev => {
                if (!prev || state.sessionId !== prev.id) return prev;
                if (state.isTerminated) {
                    return { ...prev, status: 'completed' };
                }
                return prev;
            });
        },
        onSimulationEnded: (sessionId) => {
            setCurrentSession(prev => {
                if (!prev || sessionId !== prev.id) return prev;
                return { ...prev, status: 'completed' };
            });
        },
    });

    const loadSessions = useCallback(async () => {
        if (!token) return;
        try {
            const response = await fetch(`${API_BASE}/api/isolation/sessions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setSessions(data.data || []);
            }
        } catch (e) {
            console.error('Failed to load sessions', e);
        }
    }, [token]);

    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    // 加载场景预设
    useEffect(() => {
        let active = true;

        const loadScenarios = async () => {
            setScenarioLoading(true);
            try {
                const response = await fetch(`${API_BASE}/api/isolation/scenarios`);
                if (!response.ok) return;
                const data = await response.json();
                const list = Array.isArray(data?.data) ? data.data : [];
                if (active && list.length > 0) {
                    setScenarios(list);
                }
            } catch (e: any) {
                isolationLogger.warn('Failed to load scenarios', { error: e?.message });
            } finally {
                if (active) setScenarioLoading(false);
            }
        };

        loadScenarios();

        return () => {
            active = false;
        };
    }, []);

    // 创建新讨论
    const handleCreateSession = async () => {
        if (!selectedScenario || !topic.trim()) {
            setError('请选择场景并输入讨论主题');
            return;
        }

        if (configuredAgents.length < 2) {
            setError('至少需要 2 个 Agent');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const scenarioInfo = scenarios.find(s => s.id === selectedScenario);

            // 准备会话级 LLM 配置（默认配置）
            let encryptedLlmConfig = undefined;
            const enabledParticipant = participants.find(p => p.config.enabled && p.config.apiKey);

            if (enabledParticipant) {
                const llmConfigData: LlmConfigData = {
                    provider: enabledParticipant.provider,
                    apiKey: enabledParticipant.config.apiKey,
                    baseUrl: enabledParticipant.config.baseUrl,
                    modelName: enabledParticipant.config.modelName,
                    temperature: enabledParticipant.config.temperature
                };
                encryptedLlmConfig = await encryptLlmConfig(llmConfigData);
            }

            // 准备 Agent 配置，包括每个 Agent 的独立 LLM 配置
            const agentsPayload = await Promise.all(configuredAgents.map(async (agent) => {
                const agentPayload: any = {
                    id: agent.id,
                    name: agent.name,
                    role: agent.role,
                    systemPrompt: agent.systemPrompt || `你是${agent.name}`,
                    personality: agent.personality,
                    stance: agent.stance,
                };

                // 如果 Agent 有独立的 LLM 配置
                if (agent.agentLlmConfig && !agent.agentLlmConfig.useSessionConfig && agent.agentLlmConfig.galaxyousConfigId) {
                    const agentParticipant = participants.find(p => p.id === agent.agentLlmConfig?.galaxyousConfigId);
                    if (agentParticipant && agentParticipant.config.apiKey) {
                        const agentLlmConfigData: LlmConfigData = {
                            provider: agentParticipant.provider,
                            apiKey: agentParticipant.config.apiKey,
                            baseUrl: agentParticipant.config.baseUrl,
                            modelName: agentParticipant.config.modelName,
                            temperature: agentParticipant.config.temperature
                        };
                        agentPayload.agentLlmConfig = {
                            useSessionConfig: false,
                            llmConfig: await encryptLlmConfig(agentLlmConfigData),
                            configSource: 'galaxyous',
                            galaxyousConfigId: agent.agentLlmConfig.galaxyousConfigId,
                        };
                    }
                }

                return agentPayload;
            }));

            const response = await fetch(`${API_BASE}/api/isolation/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title: `${topic} - ${new Date().toLocaleDateString()}`,
                    topic,
                    scenario: {
                        id: selectedScenario,
                        name: scenarioInfo?.name || selectedScenario,
                        type: scenarioInfo?.type || selectedScenario
                    },
                    agents: agentsPayload,
                    llmConfig: encryptedLlmConfig,
                }),
            });

            if (!response.ok) {
                throw new Error('创建会话失败');
            }

            const data = await response.json();
            const sessionId = data.data.id || data.data.sessionId;
            const joinResult = await socketJoinSession(sessionId);
            if (!joinResult.success) {
                isolationLogger.warn('Failed to join session via socket', { sessionId, error: joinResult.error });
            }
            setCurrentSession({
                ...data.data,
                id: sessionId,
                status: 'pending',
                currentRound: 0,
                agents: data.data.agents.map((a: any) => ({ ...a, status: 'idle', speakCount: 0 })),
                events: [],
            });
            setView('discussion');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // 开始讨论
    const handleStartDiscussion = async () => {
        if (!currentSession) return;
        try {
            await fetch(`${API_BASE}/api/isolation/sessions/${currentSession.id}/start`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            setCurrentSession(prev => prev ? { ...prev, status: 'active' } : null);
        } catch (e) {
            console.error('Failed to start', e);
        }
    };

    // 结束讨论
    const handleEndDiscussion = async () => {
        if (!currentSession) return;
        try {
            await fetch(`${API_BASE}/api/isolation/sessions/${currentSession.id}/end`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ reason: 'User ended' }),
            });
            setCurrentSession(prev => prev ? { ...prev, status: 'completed' } : null);
        } catch (e) {
            isolationLogger.error('Failed to end discussion', { error: (e as Error).message });
            setError('结束讨论失败');
        }
    };

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-slate-900 to-purple-900/20">
            {/* 头部 */}
            <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onExit}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <ChevronLeft size={20} className="text-slate-400" />
                    </button>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-white flex items-center gap-2">
                            <FlaskConical className="text-purple-400" size={24} />
                            隔离模式
                            {/* Socket 连接状态 */}
                            {reconnecting ? (
                                <span className="flex items-center gap-1 text-yellow-400">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-xs">重连中 ({reconnectAttempts})</span>
                                </span>
                            ) : socketConnected ? (
                                <Wifi size={16} className="text-green-400" />
                            ) : (
                                <WifiOff size={16} className="text-red-400" />
                            )}
                        </h1>
                        <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                            实验性
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setView('setup')}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === 'setup' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <Plus size={16} className="inline mr-1" />
                        新建
                    </button>
                    <button
                        onClick={() => { setView('history'); loadSessions(); }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${view === 'history' ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <History size={16} className="inline mr-1" />
                        历史
                    </button>
                </div>
            </header>

            {/* 主内容 */}
            <main className="flex-1 overflow-hidden p-6">
                {view === 'setup' && (
                    <div className="max-w-3xl mx-auto space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-4">选择讨论场景</h2>
                            {scenarioLoading && scenarios.length === 0 ? (
                                <div className="text-sm text-slate-400">加载场景中...</div>
                            ) : (
                                <ScenarioSelector
                                    scenarios={scenarios}
                                    selected={selectedScenario}
                                    onSelect={setSelectedScenario}
                                />
                            )}
                        </div>

                        <div>
                            <h2 className="text-lg font-semibold text-white mb-4">讨论主题</h2>
                            <input
                                type="text"
                                value={topic}
                                onChange={e => setTopic(e.target.value)}
                                placeholder="输入你想讨论的问题..."
                                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none transition-colors"
                            />
                        </div>

                        {/* Agent 配置面板 */}
                        <div className="bg-slate-800/30 rounded-xl p-4 border border-white/5">
                            <AgentConfigPanel
                                agents={configuredAgents}
                                onAgentsChange={setConfiguredAgents}
                                participants={participants}
                                scenarioType={selectedScenario || undefined}
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleCreateSession}
                            disabled={loading || !selectedScenario || !topic.trim()}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <RefreshCw className="animate-spin" size={18} />
                            ) : (
                                <Users size={18} />
                            )}
                            创建讨论
                        </button>
                    </div>
                )}

                {view === 'discussion' && currentSession && (
                    <div className="h-full flex gap-6">
                        {/* 左侧 - Agent 面板 */}
                        <div className="w-64 shrink-0 space-y-4">
                            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                                参与者 ({currentSession.agents.length})
                            </h3>
                            <div className="space-y-3">
                                {currentSession.agents.map(agent => (
                                    <AgentCard
                                        key={agent.id}
                                        agent={agent}
                                        isActive={agent.status === 'speaking'}
                                    />
                                ))}
                            </div>

                            <div className="pt-4 border-t border-white/10 space-y-2">
                                {currentSession.status === 'pending' && (
                                    <button
                                        onClick={handleStartDiscussion}
                                        className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-2"
                                    >
                                        <Play size={16} />
                                        开始讨论
                                    </button>
                                )}
                                {currentSession.status === 'active' && (
                                    <>
                                        <button className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg flex items-center justify-center gap-2">
                                            <Pause size={16} />
                                            暂停
                                        </button>
                                        <button
                                            onClick={handleEndDiscussion}
                                            className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center justify-center gap-2"
                                        >
                                            <Square size={16} />
                                            结束
                                        </button>
                                    </>
                                )}
                                {currentSession.status === 'completed' && (
                                    <div className="text-center text-slate-400 py-2">
                                        讨论已结束
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 右侧 - 事件时间线 */}
                        <div className="flex-1 bg-slate-800/30 rounded-2xl p-6 border border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white">
                                    {currentSession.topic}
                                </h3>
                                <div className="text-sm text-slate-400">
                                    第 {currentSession.currentRound} 轮
                                </div>
                            </div>
                            <EventTimeline events={currentSession.events} />
                        </div>
                    </div>
                )}

                {view === 'history' && (
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-lg font-semibold text-white mb-4">讨论历史</h2>
                        {sessions.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                暂无历史记录
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sessions.map((session: any) => (
                                    <div
                                        key={session.sessionId}
                                        className="p-4 bg-slate-800/50 border border-white/10 rounded-xl hover:border-purple-500/30 transition-colors cursor-pointer"
                                    >
                                        <div className="font-medium text-white">{session.title}</div>
                                        <div className="text-sm text-slate-400 mt-1">
                                            {session.scenarioName} • {session.agentCount} 参与者 • {session.eventCount} 条发言
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default IsolationModeContainer;
