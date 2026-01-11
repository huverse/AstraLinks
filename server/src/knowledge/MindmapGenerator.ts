/**
 * MindmapGenerator - 思维导图生成器
 * 使用 AI 从文档内容生成结构化思维导图
 */

import { adapterRegistry } from '../adapters';
import { MindmapNode } from './types';

export class MindmapGenerator {
    // 生成思维导图
    async generate(
        content: string,
        options: {
            userId: number;
            providerId?: string;
            credentialId?: string;
            model?: string;
            maxDepth?: number;
            title?: string;
        }
    ): Promise<MindmapNode> {
        const { userId, providerId = 'openai', credentialId, model, maxDepth = 3, title = '主题' } = options;

        // 截取内容
        const truncatedContent = content.length > 8000
            ? content.substring(0, 8000) + '\n\n[内容已截断...]'
            : content;

        const prompt = `请分析以下内容，生成一个结构化的思维导图。

要求：
1. 输出纯 JSON 格式，不要包含 markdown 代码块标记
2. 最大深度为 ${maxDepth} 层
3. 每个节点包含 id（唯一标识）、text（节点文字）、children（子节点数组，可选）
4. 提取核心概念和关键信息
5. 层级关系要清晰

期望的 JSON 结构：
{
  "id": "root",
  "text": "主题",
  "children": [
    {
      "id": "1",
      "text": "分支1",
      "children": [...]
    }
  ]
}

内容：
${truncatedContent}

请直接输出 JSON，不要任何其他文字：`;

        const adapter = await adapterRegistry.createAdapter(userId, providerId, credentialId);
        const result = await adapter.chat(
            [{ role: 'user', content: prompt }],
            { model, maxTokens: 2000 }
        );

        // 解析 JSON
        try {
            const jsonText = this.extractJson(result.text);
            const mindmap = JSON.parse(jsonText);

            // 验证结构
            if (!this.validateMindmap(mindmap)) {
                throw new Error('Invalid mindmap structure');
            }

            // 添加层级信息
            this.addLevelInfo(mindmap, 0);

            return mindmap;
        } catch (err) {
            console.error('[MindmapGenerator] Failed to parse:', result.text);
            // 返回默认结构
            return {
                id: 'root',
                text: title,
                level: 0,
                children: [{
                    id: '1',
                    text: '无法解析内容',
                    level: 1
                }]
            };
        }
    }

    // 从响应中提取 JSON
    private extractJson(text: string): string {
        // 移除 markdown 代码块
        let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // 尝试找到 JSON 对象
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return jsonMatch[0];
        }

        return cleaned.trim();
    }

    // 验证思维导图结构
    private validateMindmap(node: unknown): node is MindmapNode {
        if (!node || typeof node !== 'object') return false;
        const n = node as Record<string, unknown>;

        if (typeof n.id !== 'string' || typeof n.text !== 'string') {
            return false;
        }

        if (n.children) {
            if (!Array.isArray(n.children)) return false;
            for (const child of n.children) {
                if (!this.validateMindmap(child)) return false;
            }
        }

        return true;
    }

    // 添加层级信息
    private addLevelInfo(node: MindmapNode, level: number): void {
        node.level = level;

        // 根据层级设置颜色
        const colors = ['#4A90D9', '#67C23A', '#E6A23C', '#F56C6C', '#909399'];
        node.color = colors[Math.min(level, colors.length - 1)];

        if (node.children) {
            for (const child of node.children) {
                this.addLevelInfo(child, level + 1);
            }
        }
    }

    // 从思维导图生成 Markdown
    toMarkdown(node: MindmapNode, indent: number = 0): string {
        const prefix = '  '.repeat(indent) + (indent > 0 ? '- ' : '# ');
        let result = prefix + node.text + '\n';

        if (node.children) {
            for (const child of node.children) {
                result += this.toMarkdown(child, indent + 1);
            }
        }

        return result;
    }

    // 统计节点数量
    countNodes(node: MindmapNode): number {
        let count = 1;
        if (node.children) {
            for (const child of node.children) {
                count += this.countNodes(child);
            }
        }
        return count;
    }
}

export const mindmapGenerator = new MindmapGenerator();
