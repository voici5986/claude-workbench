/**
 * 上下文窗口使用情况计算 Hook
 *
 * 参考 Claude Code v2.0.64 的 current_usage 功能
 * 计算当前会话的上下文窗口使用百分比
 *
 * 重要说明（来自官方文档）：
 * - total_input_tokens / total_output_tokens: 整个会话的累计总量
 * - current_usage: 最后一次 API 调用返回的当前上下文窗口使用情况
 *   - input_tokens: 当前上下文中的输入 tokens
 *   - cache_creation_input_tokens: 写入缓存的 tokens
 *   - cache_read_input_tokens: 从缓存读取的 tokens
 *
 * 计算公式：
 * CURRENT_TOKENS = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
 * PERCENT_USED = CURRENT_TOKENS * 100 / CONTEXT_SIZE
 */

import { useMemo } from 'react';
import { getContextWindowSize } from '@/lib/tokenCounter';
import { ContextWindowUsage, ContextUsageLevel, getUsageLevel } from '@/types/contextWindow';
import type { ClaudeStreamMessage } from '@/types/claude';

export interface UseContextWindowUsageResult extends ContextWindowUsage {
  /** 使用级别 */
  level: ContextUsageLevel;
  /** 是否有有效数据 */
  hasData: boolean;
  /** 格式化的百分比字符串 */
  formattedPercentage: string;
  /** 格式化的 token 使用字符串 */
  formattedTokens: string;
}

/**
 * 从消息中提取 current_usage 数据
 * 查找最后一条带有 usage 信息的消息
 */
function extractCurrentUsage(messages: ClaudeStreamMessage[]): {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
} | null {
  // 从后向前遍历，找到最后一条带有 usage 的消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as any;

    // 尝试从不同位置获取 usage 数据
    const usage = message.message?.usage || message.usage;

    if (usage && typeof usage === 'object') {
      // 提取各字段，处理不同的命名方式
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;

      // 缓存创建 tokens（多种命名方式）
      const cacheCreationTokens =
        usage.cache_creation_input_tokens ||
        usage.cache_creation_tokens ||
        usage.cache_write_tokens ||
        0;

      // 缓存读取 tokens（多种命名方式）
      const cacheReadTokens =
        usage.cache_read_input_tokens ||
        usage.cache_read_tokens ||
        0;

      // 只有当有有效数据时才返回
      if (inputTokens > 0 || cacheCreationTokens > 0 || cacheReadTokens > 0) {
        return {
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
        };
      }
    }
  }

  return null;
}

/**
 * 计算上下文窗口使用情况
 *
 * @param messages - 会话消息列表
 * @param model - 当前使用的模型名称
 * @returns 上下文窗口使用情况
 *
 * @example
 * const { percentage, level, formattedPercentage } = useContextWindowUsage(messages, 'sonnet');
 * // percentage: 42.5
 * // level: 'low'
 * // formattedPercentage: '42.5%'
 */
export function useContextWindowUsage(
  messages: ClaudeStreamMessage[],
  model?: string
): UseContextWindowUsageResult {
  return useMemo(() => {
    // 获取上下文窗口大小
    const contextWindowSize = getContextWindowSize(model);

    // 默认返回值
    const defaultResult: UseContextWindowUsageResult = {
      currentTokens: 0,
      contextWindowSize,
      percentage: 0,
      breakdown: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      level: 'low' as ContextUsageLevel,
      hasData: false,
      formattedPercentage: '0%',
      formattedTokens: `0 / ${formatK(contextWindowSize)}`,
    };

    // 如果没有消息，返回默认值
    if (!messages || messages.length === 0) {
      return defaultResult;
    }

    // 从最后一条消息中提取 current_usage 数据
    const currentUsage = extractCurrentUsage(messages);

    if (!currentUsage) {
      return defaultResult;
    }

    // 根据 Claude Code 官方公式计算当前使用量
    // CURRENT_TOKENS = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
    // 注意：不包括 output_tokens，因为输出不占用上下文窗口（它是生成的）
    const currentTokens =
      currentUsage.inputTokens +
      currentUsage.cacheCreationTokens +
      currentUsage.cacheReadTokens;

    // 计算百分比
    const percentage = contextWindowSize > 0
      ? Math.min((currentTokens / contextWindowSize) * 100, 100)
      : 0;

    // 获取使用级别
    const level = getUsageLevel(percentage);

    // 格式化显示
    const formattedPercentage = `${percentage.toFixed(1)}%`;
    const formattedTokens = `${formatK(currentTokens)} / ${formatK(contextWindowSize)}`;

    return {
      currentTokens,
      contextWindowSize,
      percentage,
      breakdown: {
        inputTokens: currentUsage.inputTokens,
        outputTokens: currentUsage.outputTokens,
        cacheCreationTokens: currentUsage.cacheCreationTokens,
        cacheReadTokens: currentUsage.cacheReadTokens,
      },
      level,
      hasData: true,
      formattedPercentage,
      formattedTokens,
    };
  }, [messages, model]);
}

/**
 * 格式化数字为 K/M 形式
 */
function formatK(n: number): string {
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return n.toString();
}

export default useContextWindowUsage;
