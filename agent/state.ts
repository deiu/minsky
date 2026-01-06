import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";

/**
 * Default model
 */
export const DEFAULT_MODEL = "grok-4-fast-reasoning";

/**
 * Max iterations for the ReAct loop to prevent runaway costs
 */
export const MAX_ITERATIONS = 20;

/**
 * LangGraph state annotation for Minsky
 * Simple messages-only state for chat compatibility
 */
export const MinskyAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

export type MinskyState = typeof MinskyAnnotation.State;

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
