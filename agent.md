# Overlay Agent Guide

本文件定义本项目的人机协作约定、工程实践要求和交付标准。除非用户明确提出相反要求，否则后续开发默认遵循这里的规则。

## 1. Communication

- All direct communication with the user must be in Simplified Chinese.
- Responses should be concise, clear, and action-oriented.
- When assumptions are necessary, make reasonable ones and state them clearly after completing the work.

## 2. Language Rules

- All code comments must be written in English.
- All logs must be written in English.
- All CLI output must be written in English.
- User-facing repository documentation may use Chinese when appropriate, but must remain internally consistent within each document.

## 3. Code Quality

- Prefer TypeScript as the primary implementation language.
- Keep modules focused and avoid mixing parsing, domain logic, rendering, and CLI concerns.
- Do not let UI or Remotion components depend directly on third-party parser objects when an internal domain model is available.
- Prefer clear naming and simple control flow over premature abstraction.
- Add comments only when they explain non-obvious intent, tradeoffs, or constraints.

## 4. Lint And Verification

- Lint must be run after every coding task before handoff.
- If lint is unavailable, misconfigured, or blocked by missing dependencies, report that explicitly.
- When tests exist and are relevant to the change, run the smallest meaningful test scope in addition to lint.

## 5. Dependency Management

- Manage dependencies using Node.js best practices.
- Prefer adding the minimum necessary dependency set.
- Prefer built-in Node.js capabilities when they are sufficient.
- Separate runtime dependencies and development dependencies correctly.
- Avoid duplicate libraries that solve the same problem unless there is a clear reason.
- Remove unused dependencies when touching related areas.
- Keep dependency versions, scripts, and config aligned with the actual toolchain in the repository.

## 6. Debug Inputs

- Files under `ref_input/` are for development and debugging only.
- Do not treat `ref_input/` as production output, released assets, or canonical test fixtures unless the user explicitly decides so.
- Temporary investigation artifacts should prefer `ref_input/` or other clearly marked debug locations instead of polluting source directories.

## 7. Documentation

- The `README.md` must include:
  - project purpose
  - setup instructions
  - usage instructions
  - coding and debugging instructions
- When behavior, commands, configuration, or workflow changes, update documentation in the same task when appropriate.
- Keep design documents and implementation behavior aligned as the project evolves.

## 8. Git And Commit Messages

- When the user asks to organize commits, generate commit messages in English.
- Prefer correct, specific, and scoped commit messages.
- Conventional Commits are recommended when they fit the change, for example:
  - `feat: add overlay render command`
  - `fix: handle missing heart rate samples`
  - `docs: document render config format`

## 9. Project Structure

- Keep source code, docs, debug input, and generated output clearly separated.
- Generated files should not be committed unless they are intentionally tracked project artifacts.
- Prefer predictable directory names and avoid creating new top-level folders without a clear need.

## 10. CLI And Logging Conventions

- CLI behavior should be stable, scriptable, and explicit.
- Error messages should be actionable and written in English.
- Logs should help diagnose each pipeline stage without requiring source inspection.
- Avoid noisy output by default, but make debugging information available through files or explicit debug modes.

## 11. Implementation Workflow

- Understand the existing repository context before making structural decisions.
- Make the smallest change set that fully solves the task.
- Preserve unrelated user changes.
- After implementation, run lint, summarize what changed, and mention any remaining risks or follow-up work.

## 12. Default Priority Order

When tradeoffs appear, prefer this order:

1. Correctness
2. Clarity
3. Maintainability
4. Debuggability
5. Performance
6. Convenience
