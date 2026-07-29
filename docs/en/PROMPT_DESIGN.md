# Prompt design

How the app turns local health stats into a stable, paste-ready LLM prompt.

**Language:** [中文](../PROMPT_DESIGN.md) | **English**

## Goals

One-click copy → paste into any chat model → consistent deep analysis report shaped like the intended outline — without re-tuning the prompt every time.

## Five layers in `MAIN_PROMPT_TEMPLATE`

### 1. Role & task

Identity: rigorous clinical data analyst. Four behavioral boundaries (e.g. no over-diagnosis, respect uncertainty, stay data-bound).

### 2. Output structure

Fixed headings so the model does not renumber chaotically:

- Executive judgment  
- Per-metric chapters (CGM / BP / weight / HRV / HR / steps / sleep / ECG / Watch activity / workouts / recovery as available)  
- Monitoring dashboard  
- Signals that warrant recheck or escalation  
- Working hypotheses  
- References  

Dimensions with no data are skipped.

### 3. Style

- Chinese by default (switch instruction for English if needed)  
- Markdown tables; numeric columns right-aligned  
- Bold key findings  
- Label **confirmed** vs **to verify** vs **hypothesis**  
- Abnormal CGM must suggest finger-stick confirmation  

### 4. Disclaimer

- CGM measures interstitial fluid (lag)  
- Does not replace clinic visits  
- Medication changes only under clinician guidance  

### 5. Data payload

Dynamically filled analysis text from `formatAnalysisForLLM()` (availability-gated tables, recovery scores, joint signals, quality notes such as dropped future-dated records).

## Three prompt variants

| Mode | Use when |
|---|---|
| **Full prompt** | Paste whole block into chat; fixed report outline |
| **Data only** | You supply your own system prompt; need clean numbers |
| **Short system prompt** | Platforms with separate system / user fields |

## Design principles

### 1. Boundaries before instructions

Put “no diagnosis / no treatment substitution” near the **top**. Models weight early instructions more than a footer disclaimer.

### 2. Hard-coded clinical thresholds

Prefer explicit numbers over vague advice, e.g.:

- CGM &lt; 3.9 → suggest finger-stick confirmation  
- &lt; 3.0 → treat as hypoglycemia pathway  
- Random &gt; 11.1 or fasting &gt; 7.0 → hyperglycemia flags  

The model matches data to thresholds instead of inventing medical guidance.

### 3. Dynamic chapters, fixed titles

Fixed headings (not `N+1` numbering). The model omits empty dimensions based on availability flags — avoids broken numbering when BP/CGM/ECG are absent.

### 4. Length control

Detail tables default to roughly the last **90 days**; older history stays in aggregate stats only. Typical full prompts fit:

- Doubao / Kimi: ~128K context  
- ChatGPT-4 family: 8K–128K by tier  
- Claude 3.5+: ~200K  
- Gemini 1.5 Pro: 1M–2M  

Also includes condensed recovery week tables, multi-week trends, ECG classification, and joint-signal bullets rather than raw sample dumps.

### 5. Trust cues in the UI

The app surfaces prompt trust metadata (e.g. “summary included”, character count) and optional **copy summary only** for short follow-ups.

## Tuning tips

1. **Richer interpretation** — append under style: “Explain clinical/physiologic meaning behind each key number.”  
2. **Shorter tables** — “Keep tables to critical columns, max 5 columns.”  
3. **English report** — replace “中文输出” / Chinese output instruction with “English output.”  
4. **Specialty lens** — rewrite role as e.g. “cardiology attending reviewing ambulatory data.”  
5. **Drop disclaimer** — remove the disclaimer section (not recommended).  
6. **Recovery emphasis** — ask for explicit comparison of this week’s recovery/load vs multi-week median baseline.

## Reuse outside the app

The prompt is a standalone asset:

1. Format stats like `formatAnalysisForLLM()`  
2. Concatenate with `MAIN_PROMPT_TEMPLATE`  
3. Paste into any LLM  

Source of truth for templates: `lib/src/prompts/llm-prompt.ts` (rebuild with `cd lib && npm run build` after edits).
