## Plan: Gemma 4 web app with Afaan Oromoo + diagram rendering

Build a lightweight web app where the UI is plain HTML/CSS/JS, the backend is a tiny Node server, and the Cerebras API key is only read on the server via `CEREBRAS_API_KEY`. The app should answer user questions in Afaan Oromoo by default, and it should render diagram code such as Mermaid directly inside the browser instead of only showing raw code.

### Steps
1. Create a minimal Node/Express server that loads `CEREBRAS_API_KEY` from environment variables and proxies chat requests to the Cerebras inference endpoint using the Gemma 4 model identifier.
2. Add a prompt-construction layer that enforces a strict Afaan Oromoo response policy unless the user explicitly asks for another language.
3. Build a plain HTML/CSS/JS frontend with a prompt box, submit button, response panel, and a dedicated diagram panel.
4. Integrate a client-side Mermaid renderer in the UI so any generated `mermaid` block can be turned into a visible diagram automatically.
5. Add a small parser that detects diagram code blocks in the model response and renders them in the diagram panel, while keeping the text answer visible in the normal response panel.
6. Verify the app end-to-end with a local run: one check for Afaan Oromoo-only response behavior and one check for Mermaid rendering from generated code.

### Relevant files
- A small Node server entry point — to read the API key, compose the request, and proxy the model call.
- A static frontend entry page — to capture prompts and display the text answer plus rendered result.
- Optional client-side helper script — to detect Mermaid blocks and initialize the renderer.

### Verification
1. Start the app locally with the environment variable set.
2. Submit a simple Afaan Oromoo question and confirm the reply is in Afaan Oromoo.
3. Ask for a system-diagram-style response and confirm the Mermaid block is rendered as a diagram rather than shown as plain text.

### Decisions
- Use a server-side proxy instead of exposing the key in the browser, because the user asked for a key-based integration and browser-side API keys are not safe for production.
- Prioritize Mermaid rendering in the browser as the first supported diagram format, with PlantUML as a possible follow-up if the renderer strategy needs to expand.
- Keep the app intentionally small and static so it works as a clean prototype in this repo.

### Further considerations
1. If you want a fully browser-only implementation, the API key would need to be handled through a secure hosted proxy or serverless edge function; otherwise the key would be exposed to users.
2. If the app is expected to support more than Mermaid, a backend renderer may be needed for PlantUML or Graphviz formats.
