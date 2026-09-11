# Examples

Seven runnable recipes. Each is one file, under 40 lines of real code, and each
prints what it cost.

Run them from the package root, so `dotenv` finds `.env` the same way your own
app will:

```bash
cd ak-litellm
cp .env.example .env           # then add LITELLM_API_KEY
node examples/01-summarize.mjs
```

| File | What it shows | Rough cost |
|---|---|---|
| [01-summarize.mjs](01-summarize.mjs) | The smallest useful call: text in, text out | $0.0002 |
| [02-extract-json.mjs](02-extract-json.mjs) | Text into a typed, schema-validated object | $0.0004 |
| [03-chat.mjs](03-chat.mjs) | Multi-turn conversation with history and streaming | $0.0006 |
| [04-answer-over-docs.mjs](04-answer-over-docs.mjs) | Q&A grounded in your own files and data | $0.0015 |
| [05-call-my-functions.mjs](05-call-my-functions.mjs) | The model calls your code and uses the result | $0.0030 |
| [06-cheap-repeated-prompts.mjs](06-cheap-repeated-prompts.mjs) | Prompt caching: the same prompt, 10x cheaper | $0.02 |
| [07-web-search.mjs](07-web-search.mjs) | Current information, on all three vendors | $0.10 |

Total for all seven: roughly **$0.13**.

## The shortest version of each

```javascript
import { Message, Chat, RagAgent, ToolAgent } from 'ak-litellm';

// summarize
const { text } = await new Message().send('Summarize: ' + article);

// extract to a typed object
const { data } = await new Message({ responseSchema: SCHEMA }).send(text);

// converse
const chat = new Chat({ systemPrompt: 'Be terse.' });
await chat.send('Capital of France?');
await chat.send('And Japan?');            // remembers

// answer over your documents
const rag = new RagAgent({ localFiles: ['./docs/api.md'] });
await rag.chat('How do I authenticate?');

// let the model call your code
const agent = new ToolAgent({ tools: [...], toolExecutor: async (name, args) => ... });
await agent.chat('What is the weather in Paris?');
```

## Two defaults worth knowing

**Prompt caching is automatic.** A system prompt over ~1,024 tokens on
`claude-sonnet-5`, `claude-opus-5`, `claude-opus-4-7` or `claude-fable-5-1` is
cached without you asking, and repeat calls cost about a tenth as much. On any
other model it is a silent no-op. See [06](06-cheap-repeated-prompts.mjs).

**Cost is on every response.** `usage.estimatedCost` is USD.
`usage.costSource === 'gateway'` means it is the gateway's own exact figure;
`'estimated'` means it came from the pricing table, which happens on streamed
calls. `null` means unknown — it never means free.
