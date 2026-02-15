import { MessagesZodState } from "@langchain/langgraph";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

/**
 * Default model
 */
export const DEFAULT_MODEL = "grok-4-fast-reasoning";

/**
 * Runtime configuration exposed to LangGraph Studio
 */
export const ConfigSchema = z.object({
  model: z.string().default(DEFAULT_MODEL),
});

/**
 * Max iterations for the ReAct loop to prevent runaway costs
 */
export const MAX_ITERATIONS = 20;

/**
 * LangGraph state schema for Minsky
 * Uses Zod-based state for Studio compatibility
 */
export const MinskyState = MessagesZodState;

/**
 * Helper to extract the user's query from messages
 */
export function getQueryFromMessages(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i] instanceof HumanMessage ||
      messages[i].getType() === "human"
    ) {
      const content = messages[i].content;
      return typeof content === "string" ? content : JSON.stringify(content);
    }
  }
  return "";
}
