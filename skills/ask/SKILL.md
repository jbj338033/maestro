---
name: ask
description: "Ask Codex or Gemini a specific question"
argument-hint: <codex|gemini> "question"
---

Use the specified model bridge to answer a question.

## Usage
`/maestro:ask codex "Review this auth implementation for security issues"`
`/maestro:ask gemini "Is this mathematical approach correct for the parking simulation?"`

## Process
1. Parse $ARGUMENTS to extract the model name and question
2. Spawn the corresponding bridge agent (`codex-bridge` or `gemini-bridge`)
3. Pass the question as the agent's task
4. Return the model's response

If the model is not specified or invalid, ask the user which model to use.
If both models' perspectives would be valuable, suggest running both and using the `synthesizer` agent to merge results.
