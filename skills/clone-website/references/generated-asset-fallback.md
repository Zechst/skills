# Generated asset fallback

An exception path, not part of the clone workflow. Default behaviour for an unrecoverable asset is to record the gap in the report and continue — never to fabricate the source site's identity.

## Gate

Use this only when **all** of the following hold:

- The original cannot be recovered after bounded attempts across the rendered page, HTML, CSS, source maps, network responses, and same-site asset paths
- No lawful local or same-site equivalent exists
- The asset is **not** a logo, trademark, product screenshot, legal or certification mark, or other distinctive brand artwork — those stay exact originals or get reported missing
- The user explicitly approves a generated substitute, understanding it is not pixel-identical source material
- `ATLASCLOUD_API_KEY` is present in the environment

Never print the key, place it in a URL, save it in an artifact, or send it to an output CDN.

## Contract

1. Fetch the live catalog at `GET https://api.atlascloud.ai/api/v1/models` and pick a currently available `Image` model supporting the required aspect ratio and style. Do not rely on a hard-coded model list; `qwen-image-3.0/text-to-image` is an example, not a default.
2. Fetch that model's `schema` URL and validate the payload against its current required fields before submitting.
3. Submit exactly one authenticated `POST https://api.atlascloud.ai/api/v1/model/generateImage`. Do not auto-retry the generation POST — surface an ambiguous or failed submission to the user.
4. Persist the prediction ID in the research artifacts, then poll `GET https://api.atlascloud.ai/api/v1/model/prediction/<id>` with bounded backoff (for example every 3s, at most 40 attempts). Stop on `completed` or `failed`.
5. Accept only HTTPS output URLs from the completed prediction. Download without the Atlas authorization header, validate media type and dimensions, and save under `public/<site-key>/`.
6. Record model ID, prompt, prediction ID, output path, and the user's approval in `docs/research/<site-key>/ARTIFACT_MANIFEST.md`, labelled as generated fallback material.

## Downstream

A generated asset is labelled in its component spec's Assets section and in the story description, so nobody downstream mistakes it for an exact original. It also appears in the final report's known-gaps list.
