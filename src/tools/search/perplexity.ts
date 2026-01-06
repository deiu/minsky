import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

/**
 * Fix malformed definition list syntax
 * Converts "Label\n: value" or "Label\n\n: value" to "Label: value"
 */
function fixDefinitionListSyntax(text: string): string {
  return text.replace(/\n+: /g, ": ");
}

const PerplexitySearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The search query for market research. Be specific and include relevant context like company names, tickers, or time periods.",
    ),
  focus: z
    .enum(["finance", "news", "general"])
    .describe(
      "The focus area for the search: 'finance' for financial data and analysis, 'news' for recent news and events, 'general' for broader research.",
    ),
});

type PerplexitySearchInput = z.infer<typeof PerplexitySearchInputSchema>;

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  citations?: string[];
}

async function callPerplexityApi(
  query: string,
  focus: string,
): Promise<{ answer: string; citations: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    throw new Error(
      "PERPLEXITY_API_KEY environment variable is not set. Please add it to your .env file.",
    );
  }

  const formatInstructions = `Use plain text and standard markdown only. Never use definition list syntax (lines starting with ": "). For key-value pairs, use "Key: value" on the same line or use tables.`;

  const systemPrompts: Record<string, string> = {
    finance: `You are a financial research assistant. Provide accurate, data-driven answers about financial markets, company performance, stock analysis, and economic trends. Include specific numbers, dates, and sources when available. Focus on factual information rather than speculation. ${formatInstructions}`,
    news: `You are a news research assistant focused on financial and market news. Provide summaries of recent news, market events, and developments. Include dates and sources. Focus on the most relevant and recent information. ${formatInstructions}`,
    general: `You are a research assistant helping with market research. Provide comprehensive, well-sourced answers. Include relevant context and background information. ${formatInstructions}`,
  };

  const messages: PerplexityMessage[] = [
    {
      role: "system",
      content: systemPrompts[focus] || systemPrompts.general,
    },
    {
      role: "user",
      content: query,
    },
  ];

  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages,
      max_tokens: 2048,
      temperature: 0.1,
      return_citations: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as PerplexityResponse;

  const answer = data.choices[0]?.message?.content || "No response received";

  return {
    answer: fixDefinitionListSyntax(answer),
    citations: data.citations || [],
  };
}

/**
 * Perplexity search tool for real-time market research
 */
export const searchPerplexity = new DynamicStructuredTool({
  name: "search_perplexity",
  description: `Search the web using Perplexity AI for real-time market research, news, and financial analysis.
This tool is ideal for:
- Getting the latest news and market sentiment about a company or sector
- Researching industry trends and competitive analysis
- Finding recent analyst opinions and market commentary
- Answering questions that require synthesizing multiple current sources
- Getting context and qualitative insights that complement structured financial data

Use this tool when you need real-time information or qualitative research that goes beyond structured financial statements and metrics.`,
  schema: PerplexitySearchInputSchema,
  func: async (input: PerplexitySearchInput) => {
    try {
      const result = await callPerplexityApi(input.query, input.focus);

      return JSON.stringify({
        query: input.query,
        focus: input.focus,
        answer: result.answer,
        citations: result.citations,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      return JSON.stringify({
        error: errorMessage,
        query: input.query,
      });
    }
  },
});
