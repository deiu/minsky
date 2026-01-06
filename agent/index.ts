import { StateGraph, MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  AIMessage,
  BaseMessage,
  ToolMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { ChatOpenAI, ChatOpenAICallOptions } from "@langchain/openai";
import { MinskyAnnotation, DEFAULT_MODEL, MAX_ITERATIONS } from "./state.js";
import { LANGCHAIN_TOOLS } from "./tools.js";
import { AGENT_SYSTEM_PROMPT } from "./prompts.js";

/**
 * Hardcoded responses for common questions
 */
const ABOUT_RESPONSE = `I'm **Minsky**, a risk-focused financial research agent for traditional markets and crypto. I prioritize robustness over prediction, analyzing tail risks, volatility, and challenging fragile market narratives.

## What I Can Do

**Company Financials**
- Income statements, balance sheets, cash flow statements
- Financial metrics (P/E ratio, margins, growth rates)
- Segmented revenue breakdowns by product/region

**Market Data**
- Stock prices (current and historical)
- Cryptocurrency prices (BTC, ETH, SOL, etc.)
- Analyst estimates and price targets

**SEC Filings**
- 10-K annual reports
- 10-Q quarterly reports
- 8-K current reports (earnings, acquisitions, etc.)

**Ownership & Trading**
- Insider trades (executive buys/sells)
- Institutional ownership (hedge funds, mutual funds)

**News & Research**
- Company news
- Google News search

## Example Questions

- "Compare Apple and Microsoft's profitability"
- "What's Tesla's revenue breakdown by segment?"
- "Show me insider trades for NVDA in the last 3 months"
- "What's Bitcoin's price trend this year?"
- "Summarize Amazon's latest 10-K risk factors"

Just ask me anything about a company or stock!`;

/**
 * Check if message is asking about capabilities
 */
function isAboutQuestion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const patterns = [
    /^(what can you do|what do you do)/,
    /^(tell me about yourself|who are you|what are you)/,
    /^(help|how can you help)/,
    /^(what are your capabilities|what can i ask)/,
    /^hi$|^hello$|^hey$/,
  ];
  return patterns.some((p) => p.test(lower));
}

/**
 * Custom ChatOpenAI that strips unsupported parameters for Grok models
 */
class ChatGrok extends ChatOpenAI {
  invocationParams(
    options?: Partial<ChatOpenAICallOptions>,
    extra?: { streaming?: boolean },
  ) {
    const params = super.invocationParams(options, extra);
    // Grok doesn't support these parameters
    delete (params as Record<string, unknown>).presence_penalty;
    delete (params as Record<string, unknown>).frequency_penalty;
    return params;
  }
}

// Track iterations to prevent runaway loops
let iterationCount = 0;

/**
 * Fix malformed definition list syntax in model output
 * Converts "Label\n: value" or "Label\n\n: value" to "Label: value"
 */
function fixDefinitionListSyntax(text: string): string {
  // Match: one or more newlines followed by ": " at start of line
  return text.replace(/\n+: /g, ": ");
}

/**
 * Handle hardcoded responses for common questions
 */
function handleHardcodedResponse(state: typeof MinskyAnnotation.State): {
  messages: BaseMessage[];
} | null {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];

  // Only check human messages
  if (
    !(lastMessage instanceof HumanMessage) &&
    lastMessage.getType() !== "human"
  ) {
    return null;
  }

  const content = lastMessage.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);

  if (isAboutQuestion(text)) {
    return {
      messages: [new AIMessage({ content: ABOUT_RESPONSE })],
    };
  }

  return null;
}

/**
 * Router: check for hardcoded responses first
 */
function routeInput(
  state: typeof MinskyAnnotation.State,
): "hardcoded" | "agent" {
  const hardcoded = handleHardcodedResponse(state);
  return hardcoded ? "hardcoded" : "agent";
}

/**
 * Return hardcoded response
 */
function returnHardcodedResponse(state: typeof MinskyAnnotation.State): {
  messages: BaseMessage[];
} {
  return handleHardcodedResponse(state) || { messages: [] };
}

/**
 * Call the model with tools bound
 */
async function callModel(
  state: typeof MinskyAnnotation.State,
): Promise<{ messages: BaseMessage[] }> {
  const model = new ChatGrok({
    model: DEFAULT_MODEL,
    temperature: 0,
    streamUsage: true,
    configuration: {
      baseURL: "https://api.x.ai/v1",
      apiKey: process.env.XAI_API_KEY,
    },
  });

  const modelWithTools = model.bindTools(LANGCHAIN_TOOLS);

  const response = await modelWithTools.invoke([
    { role: "system" as const, content: AGENT_SYSTEM_PROMPT },
    ...state.messages,
  ]);

  // Fix definition list syntax in text responses
  if (typeof response.content === "string" && response.content) {
    response.content = fixDefinitionListSyntax(response.content);
  }

  iterationCount++;
  return { messages: [response] };
}

/**
 * Route based on whether tools need to be called
 * Also enforces max iterations to prevent cost blowup
 */
function routeModelOutput(
  state: typeof MinskyAnnotation.State,
): "__end__" | "tools" {
  // Safety: stop after max iterations
  if (iterationCount >= MAX_ITERATIONS) {
    console.warn(`Max iterations (${MAX_ITERATIONS}) reached, forcing end`);
    iterationCount = 0; // Reset for next run
    return "__end__";
  }

  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage._getType() === "ai") {
    const aiMessage = lastMessage as AIMessage;
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      return "tools";
    }
  }

  // Reset counter when naturally ending
  iterationCount = 0;
  return "__end__";
}

/**
 * Tool node for executing tools
 */
const toolNode = new ToolNode(LANGCHAIN_TOOLS);

/**
 * Announce what tools are about to be called
 */
function announceToolCalls(state: typeof MinskyAnnotation.State): {
  messages: BaseMessage[];
} {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage._getType() !== "ai") {
    return { messages: [] };
  }

  const aiMessage = lastMessage as AIMessage;
  const toolCalls = aiMessage.tool_calls || [];

  if (toolCalls.length === 0) {
    return { messages: [] };
  }

  const announcement = `🔍 Researching...`;

  return {
    messages: [new AIMessage({ content: announcement })],
  };
}

/**
 * Summarize what tools were just called to keep user informed
 */
function summarizeToolResults(state: typeof MinskyAnnotation.State): {
  messages: BaseMessage[];
} {
  const messages = state.messages;

  // Find recent tool messages (after the last AI message with tool calls)
  const toolMessages: ToolMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg._getType() === "tool") {
      toolMessages.unshift(msg as ToolMessage);
    } else if (msg._getType() === "ai") {
      break;
    }
  }

  if (toolMessages.length === 0) {
    return { messages: [] };
  }

  const summary = `✓ Data retrieved. Analyzing...`;

  return {
    messages: [new AIMessage({ content: summary })],
  };
}

/**
 * Dexter Financial Research Agent
 *
 * Flow:
 * 1. Router checks for hardcoded responses (greetings, "what can you do", etc.)
 * 2. If hardcoded, return immediately
 * 3. Otherwise, agent decides what tools to call
 * 4. Tools execute and return results
 * 5. Progress node summarizes what was retrieved
 * 6. Agent loops until it has enough info to respond
 * 7. Max 10 iterations to control costs
 */
const workflow = new StateGraph(MinskyAnnotation)
  .addNode("hardcoded", returnHardcodedResponse)
  .addNode("agent", callModel)
  .addNode("announce", announceToolCalls)
  .addNode("tools", toolNode)
  .addNode("progress", summarizeToolResults)
  .addConditionalEdges("__start__", routeInput, {
    hardcoded: "hardcoded",
    agent: "agent",
  })
  .addEdge("hardcoded", "__end__")
  .addConditionalEdges("agent", routeModelOutput, {
    tools: "announce",
    __end__: "__end__",
  })
  .addEdge("announce", "tools")
  .addEdge("tools", "progress")
  .addEdge("progress", "agent");

/**
 * Compiled graph - main export for LangGraph deployment
 */
export const graph = workflow.compile({
  checkpointer: new MemorySaver(),
});

graph.name = "Minsky";

// Re-export types
export { MinskyAnnotation, type MinskyState } from "./state.js";
