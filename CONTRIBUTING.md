# Contributing to Earthward AI

Thanks for helping. Earthward AI is small and readable on purpose, so most changes are a single afternoon's work.

## Good places to start

- Issues labelled [good first issue](https://github.com/earthwardai/earthward/labels/good%20first%20issue).
- **New causes.** Use the "Propose a cause" issue form. Every cause needs a cost estimate with a source.
- **Better agents.** The agents' mandates and voices live in `shared/agents.ts`. If you think one argues badly, show a before and after from `npm run council`.
- **New model providers.** Anything with an OpenAI-compatible API already works. See `server/llm.ts`.

## Setup

```sh
npm install
npm run build
npm test
npm run council        # one council session in your terminal
npm run dev            # the full site on http://localhost:8787 (see README for .env.local)
```

## Ground rules

- Keep the council's rules deterministic. Models propose, code decides. Any change to `shared/council.ts` needs a test in `tests/domain.test.ts`.
- Never let donor text reach a model as instructions. It stays quoted and labelled as data.
- No third-party trackers or ad scripts on the site.
- Write copy in plain English, without hype.

## Pull requests

Keep them focused, describe what changed and how you checked it, and make sure `npm run build` and `npm test` pass. CI runs both on every pull request.

By contributing you agree that your work is licensed under the AGPL-3.0, like the rest of the project, and that you'll follow our [code of conduct](CODE_OF_CONDUCT.md).
