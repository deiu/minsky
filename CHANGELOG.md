# Changelog

## 2025-02-15 — LangGraph JS 0.3.x to 1.1.x Migration

### Breaking Changes

1. **`invocationParams()` signature changed** — If you subclass `ChatOpenAI`, the
   `extra` parameter was removed. Update overrides from
   `invocationParams(options, extra)` to `invocationParams(options)`.

2. **State must use Zod schemas for Studio compatibility** — The LangGraph API
   server and Studio can only extract schemas from Zod objects. `Annotation.Root`
   works at runtime but is invisible to Studio, so the chat UI won't function.
   Use `MessagesZodState` instead of `Annotation.Root` with `MessagesAnnotation.spec`.

3. **Config schema must also be Zod** — Same issue as state: `Annotation.Root`
   config schemas aren't detected by Studio. Use a plain `z.object()` and pass it
   as the `context` option in the `StateGraph` constructor.
