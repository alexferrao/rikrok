// Condensed, prompt-sized evidence for the script LLM. Works on the Activity
// shape every session source produces (see src/sources/index.mjs).
export function condense(act, gitCommits = []) {
  const fmt = (arr, n, f) => arr.slice(-n).map(f);
  const toolTally = {};
  for (const t of act.tools) toolTally[t.name] = (toolTally[t.name] || 0) + 1;

  return {
    duration_minutes: Math.max(1, Math.round(act.activeMs / 60000)),
    assistant_turns: act.assistantTurns,
    tool_uses: act.toolUses,
    user_prompts: fmt(act.userPrompts, 6, (p) => p.text),
    assistant_notes: fmt(act.assistantTexts, 8, (a) => a.text.slice(0, 350)),
    files_touched: act.filesTouched.slice(0, 15),
    commands_run: fmt(act.commands, 10, (c) => c.desc || c.command),
    tool_tally: toolTally,
    git_commits: gitCommits.slice(0, 12),
    urls_mentioned: act.urls.slice(0, 8),
    todos: (act.todoSnapshots || []).map((t) => ({ content: t.content, status: t.status })),
  };
}
