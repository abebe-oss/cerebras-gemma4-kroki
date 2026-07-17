# cerebras-gemma4-kroki

A small web app that uses Cerebras inference with Gemma 4, enforces Afaan Oromoo responses, and renders Mermaid diagrams in the browser.

## Setup

1. Copy `.env.example` to `.env`.
2. Set your `CEREBRAS_API_KEY` in the shell or in `.env`.
3. Start the app:

```bash
npm start
```

## Endpoint

- `GET /health` check
- `POST /api/chat` chat proxy

## Notes

- The API key is kept server-side. Do not put it in the browser.
- The app is designed to answer in Afaan Oromoo unless the user explicitly asks for another language.
- Mermaid code in the model output is automatically rendered in the UI.
