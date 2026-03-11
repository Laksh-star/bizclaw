/**
 * BizClaw MCP tools for the NanoClaw agent runner.
 * Isolated here so upstream changes to ipc-mcp-stdio.ts don't conflict.
 *
 * Registers: call_model (OpenRouter), call_lm_studio (local LM Studio)
 * Also exports helpers for wiring BizClaw MCP servers and env into agent-runner/index.ts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

// ─── MCP Tools ────────────────────────────────────────────────────────────────

export function registerBizclawTools(server: McpServer): void {
  server.tool(
    'call_model',
    `Call a non-Claude AI model via OpenRouter for a specific subtask. Use this when a specialized model would handle a step better than you would — e.g. Kimi for editing/writing polish, Gemini for analysis, Perplexity for search-grounded answers.

The model runs independently with no memory of your conversation. Pass all necessary context in the prompt.

If no model is specified, the configured default (OPENROUTER_DEFAULT_MODEL) is used.

Common model IDs:
• moonshotai/kimi-k2.5 — long-context editing and writing
• google/gemini-2.0-flash-001 — fast analysis and structured output
• perplexity/sonar-pro — web-grounded research
• openai/gpt-4o — general purpose`,
    {
      model: z.string().optional().describe('OpenRouter model ID (e.g., "moonshotai/kimi-k2.5"). Omit to use the configured default.'),
      prompt: z.string().describe('The full prompt to send, including all necessary context'),
      system: z.string().optional().describe('Optional system prompt to set the model\'s role or constraints'),
      max_tokens: z.number().int().positive().optional().describe('Maximum tokens to generate. Omit to use the model default.'),
    },
    async (args) => {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: 'text' as const, text: 'OPENROUTER_API_KEY is not configured. Add it to .env.' }],
          isError: true,
        };
      }

      const model = args.model || process.env.OPENROUTER_DEFAULT_MODEL;
      if (!model) {
        return {
          content: [{ type: 'text' as const, text: 'No model specified and OPENROUTER_DEFAULT_MODEL is not configured. Pass a model ID or set the default in .env.' }],
          isError: true,
        };
      }

      const messages: Array<{ role: string; content: string }> = [];
      if (args.system) {
        messages.push({ role: 'system', content: args.system });
      }
      messages.push({ role: 'user', content: args.prompt });

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'nanoclaw',
          },
          body: JSON.stringify({
            model,
            messages,
            ...(args.max_tokens != null ? { max_tokens: args.max_tokens } : {}),
          }),
        });

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        };

        if (!response.ok || data.error) {
          const msg = data.error?.message ?? `HTTP ${response.status}`;
          return {
            content: [{ type: 'text' as const, text: `OpenRouter error: ${msg}` }],
            isError: true,
          };
        }

        const text = data.choices?.[0]?.message?.content ?? '';
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Request failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'call_lm_studio',
    `Call a locally-hosted model via LM Studio (running on the local network). Free — no API cost. Use for tasks where a local model is sufficient: drafting, summarising, classification, translation, code explanation.

Omit the model parameter to use whichever model is currently active in LM Studio.

Available models:
• google/gemma-3-4b — fast, good for quick tasks
• liquid/lfm2-24b-a2b — capable 24B MoE, good general purpose
• openai/gpt-oss-20b — OpenAI open-source 20B
• mistralai/devstral-small-2-2512 — code-focused
• nvidia-nemotron-3-nano-30b-a3b-mlx — 30B MoE, MLX-optimised
• minicpm-o-4_5 — multimodal (text + image)
• nanbeige4.1-3b — small, very fast

The model runs independently with no memory of your conversation. Pass all necessary context in the prompt.`,
    {
      model: z.string().optional().describe('LM Studio model ID (e.g. "liquid/lfm2-24b-a2b"). Omit to use the currently active model.'),
      prompt: z.string().describe('The full prompt to send, including all necessary context'),
      system: z.string().optional().describe('Optional system prompt'),
      max_tokens: z.number().int().positive().optional().describe('Maximum tokens to generate'),
    },
    async (args) => {
      const baseUrl = process.env.LM_STUDIO_BASE_URL;
      if (!baseUrl) {
        return {
          content: [{ type: 'text' as const, text: 'LM_STUDIO_BASE_URL is not configured. Add it to .env.' }],
          isError: true,
        };
      }

      const messages: Array<{ role: string; content: string }> = [];
      if (args.system) messages.push({ role: 'system', content: args.system });
      messages.push({ role: 'user', content: args.prompt });

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(args.model ? { model: args.model } : {}),
            messages,
            ...(args.max_tokens != null ? { max_tokens: args.max_tokens } : {}),
          }),
        });

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        };

        if (!response.ok || data.error) {
          const msg = data.error?.message ?? `HTTP ${response.status}`;
          return {
            content: [{ type: 'text' as const, text: `LM Studio error: ${msg}` }],
            isError: true,
          };
        }

        const text = data.choices?.[0]?.message?.content ?? '';
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Request failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}

// ─── MCP Server Config Helpers ────────────────────────────────────────────────

/**
 * Extra env vars to inject into the nanoclaw MCP server process.
 * These are BizClaw secrets that the MCP tools (call_model, call_lm_studio) read at runtime.
 */
export function getBizclawNanoclawMcpEnv(
  sdkEnv: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (sdkEnv.OPENROUTER_API_KEY) env.OPENROUTER_API_KEY = sdkEnv.OPENROUTER_API_KEY;
  if (sdkEnv.OPENROUTER_DEFAULT_MODEL) env.OPENROUTER_DEFAULT_MODEL = sdkEnv.OPENROUTER_DEFAULT_MODEL;
  if (sdkEnv.LM_STUDIO_BASE_URL) env.LM_STUDIO_BASE_URL = sdkEnv.LM_STUDIO_BASE_URL;
  return env;
}

/**
 * BizClaw MCP server definitions: Tavily search + TMDB movie database.
 * Spread these into the mcpServers config in agent-runner/index.ts.
 */
export function getBizclawMcpServers(sdkEnv: Record<string, string | undefined>): Record<string, {
  command: string;
  args: string[];
  env?: Record<string, string>;
}> {
  return {
    tavily: {
      command: 'tavily-mcp',
      args: [],
      env: {
        TAVILY_API_KEY: (sdkEnv.TAVILY_API_KEY as string) || '',
      },
    },
    tmdb: {
      command: 'node',
      args: ['/opt/mcp-server-tmdb/dist/index.js'],
      env: {
        TMDB_API_KEY: (sdkEnv.TMDB_API_KEY as string) || '',
        // Proxy TMDB calls through the host (macOS) to avoid Apple Container CloudFront routing issues.
        TMDB_BASE_URL: 'http://192.168.64.1:7878/tmdb',
      },
    },
  };
}

// ─── Tavily Movie Block Hook ───────────────────────────────────────────────────

const MOVIE_KEYWORDS = [
  'movie', 'film', 'cinema', 'theater', 'theatre', 'playing', 'now playing',
  'streaming', 'netflix', 'amazon prime', 'hotstar', 'disney+', 'prime video',
  'box office', 'release date', 'actor', 'actress', 'director', 'cast',
  'imdb', 'tmdb', 'tv show', 'tv series', 'web series', 'episode', 'season',
  'anime', 'bollywood', 'hollywood', 'tollywood', 'kollywood', 'watchlist',
  'watch tonight', 'what to watch', 'recommend.*movie', 'recommend.*film',
  'trending movie', 'trending film', 'new movie', 'latest movie',
];

export function createTavilyMovieBlockHook(): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preInput = input as PreToolUseHookInput;
    const queryArg = (preInput.tool_input as { query?: string })?.query?.toLowerCase() || '';
    const isMovieQuery = MOVIE_KEYWORDS.some(kw => queryArg.includes(kw) || new RegExp(kw).test(queryArg));
    if (isMovieQuery) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            'Movie/TV queries must use TMDB MCP tools, not Tavily. ' +
            'Available tools: mcp__tmdb__get_now_playing (theaters), mcp__tmdb__search_movies, ' +
            'mcp__tmdb__get_trending, mcp__tmdb__get_movie_details, mcp__tmdb__get_watch_providers, ' +
            'mcp__tmdb__search_tv_shows, mcp__tmdb__get_trending_tv. Use these instead.',
        },
      };
    }
    return {};
  };
}
