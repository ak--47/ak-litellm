/**
 * @fileoverview Classes the sibling packages export that this gateway cannot
 * back.
 *
 * These are constructor-throws, not import-throws, on purpose. The module
 * import succeeds, so an app that imports the whole namespace keeps running and
 * unrelated code paths are unaffected. The failure lands on the exact line that
 * tries to use the missing feature, with the cause and the workaround in the
 * message.
 */

/**
 * Vector embeddings. Available in `ak-gemini`; not available here.
 *
 * `POST /v1/embeddings` returns 400 on this key — the gateway serves no
 * embedding model (verified 2026-09-08).
 */
export class Embedding {
	constructor() {
		throw new Error(
			'ak-litellm: Embedding is not available. The Mixpanel LiteLLM gateway ' +
			'serves no embedding models (GET /v1/embeddings returns 400, verified ' +
			'2026-09-08). Use ak-gemini for embeddings, or ask the gateway owners ' +
			'to add an embedding model.'
		);
	}
}

/**
 * Image generation. Available in `ak-gemini`; not available here.
 *
 * `GET /v1/models` lists no image model (verified 2026-09-08).
 */
export class ImageGenerator {
	constructor() {
		throw new Error(
			'ak-litellm: ImageGenerator is not available. The Mixpanel LiteLLM ' +
			'gateway serves no image-generation models — none appear in GET /v1/models ' +
			'(verified 2026-09-08). Use ak-gemini for image generation, or ask the ' +
			'gateway owners to add an image model.'
		);
	}
}

/**
 * Autonomous agent. Available in `ak-claude`; not available here.
 *
 * `AgentQuery` wraps `@anthropic-ai/claude-agent-sdk`, which speaks to the
 * Anthropic API directly and cannot be pointed at a gateway.
 */
export class AgentQuery {
	constructor() {
		throw new Error(
			'ak-litellm: AgentQuery is not available. It wraps ' +
			'@anthropic-ai/claude-agent-sdk, which authenticates against the Anthropic ' +
			'API directly and cannot be pointed at the Mixpanel LiteLLM gateway. Use ' +
			'ak-claude for AgentQuery, or use CodeAgent/ToolAgent here.'
		);
	}
}

export default { Embedding, ImageGenerator, AgentQuery };
