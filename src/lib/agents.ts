import { JAPANESE_AGENT_SYSTEM_PROMPTS } from './prompts/ja';

export type AgentType = 'planner' | 'writer' | 'editor' | 'reviewer' | 'character' | 'worldbuilder';

export interface AgentDefinition {
  id: AgentType;
  name: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  systemPrompt: string;
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'planner',
    name: '策划Agent',
    emoji: '🎯',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/30',
    description: '构建故事框架、主题冲突、世界大纲',
    systemPrompt: JAPANESE_AGENT_SYSTEM_PROMPTS.planner,
  },
  {
    id: 'writer',
    name: '写手Agent',
    emoji: '✍️',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/30',
    description: '将大纲转化为生动的章节文字',
    systemPrompt: JAPANESE_AGENT_SYSTEM_PROMPTS.writer,
  },
  {
    id: 'editor',
    name: '编辑Agent',
    emoji: '📝',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
    description: '润色文字、去除AI痕迹、提升文学性',
    systemPrompt: JAPANESE_AGENT_SYSTEM_PROMPTS.editor,
  },
  {
    id: 'reviewer',
    name: '评审Agent',
    emoji: '🔍',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/30',
    description: '多维度评估小说质量并打分',
    systemPrompt: JAPANESE_AGENT_SYSTEM_PROMPTS.reviewer,
  },
  {
    id: 'character',
    name: '角色Agent',
    emoji: '👤',
    color: 'text-rose-400',
    bgColor: 'bg-rose-400/10',
    borderColor: 'border-rose-400/30',
    description: '设计角色形象、管理人物关系、追踪角色成长',
    systemPrompt: JAPANESE_AGENT_SYSTEM_PROMPTS.character,
  },
  {
    id: 'worldbuilder',
    name: '世界观Agent',
    emoji: '🌍',
    color: 'text-teal-400',
    bgColor: 'bg-teal-400/10',
    borderColor: 'border-teal-400/30',
    description: '构建完整、自洽的世界设定体系',
    systemPrompt: JAPANESE_AGENT_SYSTEM_PROMPTS.worldbuilder,
  },
];

export const AGENT_MAP = Object.fromEntries(AGENTS.map(a => [a.id, a]));

export function getAgent(id: AgentType): AgentDefinition {
  return AGENT_MAP[id];
}
