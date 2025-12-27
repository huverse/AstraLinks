/**
 * 隔离模式功能测试
 */

import { scenarioLoader } from '../isolation-mode/scenarios';
import { resolveDiscussionRules } from '../isolation-mode/scenarios/RulesResolver';
import { RuleEngine } from '../isolation-mode/moderator/RuleEngine';
import { SessionState } from '../isolation-mode/core/types';

describe('Isolation Mode', () => {
    describe('ScenarioLoader', () => {
        it('should load debate scenario with new schema', async () => {
            const scenario = await scenarioLoader.load('debate');

            expect(scenario.id).toBe('debate');
            expect(scenario.name).toBe('辩论');
            expect(scenario.alignment).toBeDefined();
            expect(scenario.alignment.type).toBe('opposing');
            expect(scenario.flow).toBeDefined();
            expect(scenario.flow.phases).toBeInstanceOf(Array);
            expect(scenario.flow.phases.length).toBeGreaterThan(0);
            expect(scenario.moderatorPolicy).toBeDefined();
        });

        it('should load brainstorm scenario', async () => {
            const scenario = await scenarioLoader.load('brainstorm');

            expect(scenario.id).toBe('brainstorm');
            expect(scenario.alignment.type).toBe('collaborative');
        });

        it('should load review scenario', async () => {
            const scenario = await scenarioLoader.load('review');

            expect(scenario.id).toBe('review');
            expect(scenario.alignment.type).toBe('collaborative');
        });

        it('should load academic scenario', async () => {
            const scenario = await scenarioLoader.load('academic');

            expect(scenario.id).toBe('academic');
            expect(scenario.alignment.type).toBe('collaborative');
        });

        it('should list available scenarios', async () => {
            const scenarios = await scenarioLoader.listAvailable();

            expect(scenarios).toContain('debate');
            expect(scenarios).toContain('brainstorm');
            expect(scenarios).toContain('review');
            expect(scenarios).toContain('academic');
        });
    });

    describe('RulesResolver', () => {
        it('should resolve rules from flow config', async () => {
            const scenario = await scenarioLoader.load('debate');
            const rules = resolveDiscussionRules(scenario);

            expect(rules.speakingOrder).toBeDefined();
            expect(rules.maxRounds).toBeGreaterThan(0);
            expect(rules.maxTimePerTurn).toBeGreaterThan(0);
        });

        it('should apply override maxRounds', async () => {
            const scenario = await scenarioLoader.load('debate');
            const rules = resolveDiscussionRules(scenario, 5);

            expect(rules.maxRounds).toBe(5);
        });
    });

    describe('RuleEngine', () => {
        let ruleEngine: RuleEngine;

        beforeEach(() => {
            ruleEngine = new RuleEngine();
        });

        it('should set and get rules', async () => {
            const scenario = await scenarioLoader.load('debate');
            const rules = resolveDiscussionRules(scenario);

            ruleEngine.setRules(rules);

            expect(ruleEngine.getRules()).toEqual(rules);
        });

        it('should check timeout correctly', async () => {
            const scenario = await scenarioLoader.load('debate');
            const rules = resolveDiscussionRules(scenario);
            ruleEngine.setRules(rules);

            const state: SessionState = {
                sessionId: 'test-session',
                status: 'active',
                currentRound: 1,
                currentSpeakerId: 'agent-1',
                currentSpeakerStartTime: Date.now() - 1000, // 1 second ago
                agentStates: new Map(),
                eventSequence: 0,
            };

            // Should not timeout after 1 second (maxTimePerTurn is 120s)
            expect(ruleEngine.checkTimeout(state)).toBe(false);
        });

        it('should detect timeout when exceeded', async () => {
            const scenario = await scenarioLoader.load('debate');
            const rules = resolveDiscussionRules(scenario);
            ruleEngine.setRules(rules);

            const state: SessionState = {
                sessionId: 'test-session',
                status: 'active',
                currentRound: 1,
                currentSpeakerId: 'agent-1',
                currentSpeakerStartTime: Date.now() - 200000, // 200 seconds ago
                agentStates: new Map(),
                eventSequence: 0,
            };

            // Should timeout after 200 seconds (maxTimePerTurn is 120s)
            expect(ruleEngine.checkTimeout(state)).toBe(true);
        });

        it('should calculate remaining time', async () => {
            const scenario = await scenarioLoader.load('debate');
            const rules = resolveDiscussionRules(scenario);
            ruleEngine.setRules(rules);

            const state: SessionState = {
                sessionId: 'test-session',
                status: 'active',
                currentRound: 1,
                currentSpeakerId: 'agent-1',
                currentSpeakerStartTime: Date.now() - 10000, // 10 seconds ago
                agentStates: new Map(),
                eventSequence: 0,
            };

            const remaining = ruleEngine.getRemainingTime(state);
            expect(remaining).not.toBeNull();
            expect(remaining).toBeGreaterThan(100); // Should have > 100 seconds left
            expect(remaining).toBeLessThan(120); // Should have < 120 seconds left
        });

        it('should select next speaker in round-robin', async () => {
            const scenario = await scenarioLoader.load('debate');
            const rules = resolveDiscussionRules(scenario);
            ruleEngine.setRules(rules);

            const mockAgents = [
                { config: { id: 'agent-1', name: 'Agent 1' } },
                { config: { id: 'agent-2', name: 'Agent 2' } },
            ] as any[];

            const state: SessionState = {
                sessionId: 'test-session',
                status: 'active',
                currentRound: 1,
                currentSpeakerId: null,
                agentStates: new Map(),
                eventSequence: 0,
            };

            const first = ruleEngine.getNextSpeaker(state, mockAgents);
            expect(first?.config.id).toBe('agent-1');

            const second = ruleEngine.getNextSpeaker(state, mockAgents);
            expect(second?.config.id).toBe('agent-2');

            const third = ruleEngine.getNextSpeaker(state, mockAgents);
            expect(third?.config.id).toBe('agent-1');
        });
    });
});
