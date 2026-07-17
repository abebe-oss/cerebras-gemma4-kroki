const form = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt');
const answerEl = document.getElementById('answer');
const statusEl = document.getElementById('status');

mermaid.initialize({ startOnLoad: false, theme: 'default' });

function inferEngineLabel(blockText, explicitLabel) {
  const label = (explicitLabel || '').toLowerCase().trim();
  const trimmed = blockText.trim();

  if (label === 'excalidraw' || label === 'mermaid' || label === 'plantuml' || label === 'dbml' || label === 'd2' || label === 'svgbob' || label === 'graphviz' || label === 'uml' || label === 'pikchr' || label === 'nomnoml' || label === 'bytefield') {
    return label;
  }

  if (trimmed.startsWith('@startuml') || trimmed.includes('@enduml')) {
    return 'plantuml';
  }

  if (/^graph\s+|^flowchart\s+|^sequenceDiagram\s+|^classDiagram\s+|^erDiagram\s+|^gantt\s+|^journey\s+|^stateDiagram\s+/im.test(trimmed)) {
    return 'mermaid';
  }

  return null;
}

function splitResponseParts(text) {
  const parts = [];
  const pattern = /```(?:([a-z0-9_-]+)\s*)?([\s\S]*?)```|@startuml[\s\S]*?@enduml/gi;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const matchStart = match.index;
    const matchText = match[0];

    if (matchStart > cursor) {
      parts.push({ type: 'text', content: text.slice(cursor, matchStart) });
    }

    const explicitLabel = (match[1] || '').toLowerCase().trim();
    const body = (match[2] || matchText || '').trim();
    const engine = inferEngineLabel(body, explicitLabel);

    if (engine) {
      parts.push({ type: 'diagram', engine, code: body.startsWith('@startuml') ? body : body });
    } else {
      parts.push({ type: 'text', content: matchText });
    }

    cursor = matchStart + matchText.length;
  }

  if (cursor < text.length) {
    parts.push({ type: 'text', content: text.slice(cursor) });
  }

  return parts;
}

function renderTextSegment(text) {
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-segment';
  wrapper.innerHTML = DOMPurify.sanitize(marked.parse(text || ''));
  answerEl.appendChild(wrapper);
}

async function renderInlineDiagrams(parts) {
  for (const part of parts) {
    if (part.type !== 'diagram') {
      continue;
    }

    const host = document.createElement('div');
    host.className = 'diagram-block';
    answerEl.appendChild(host);

    try {
      const response = await fetch('/api/render-diagram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          engine: part.engine,
          format: 'svg',
          diagram: part.code
        })
      });

      if (!response.ok) {
        throw new Error('Unable to fetch diagram');
      }

      const svgText = await response.text();
      host.innerHTML = svgText;
    } catch (error) {
      host.innerHTML = '<p>Could not render this diagram. Please check the engine or syntax.</p>';
      console.error(error);
    }
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  if (!prompt) {
    statusEl.textContent = 'Please enter a question first.';
    return;
  }

  statusEl.textContent = 'Sending request…';
  answerEl.innerHTML = '<p>Loading…</p>';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    const answer = data.answer || '';
    const parts = splitResponseParts(answer);

    answerEl.innerHTML = '';

    for (const part of parts) {
      if (part.type === 'text') {
        renderTextSegment(part.content);
      } else {
        const host = document.createElement('div');
        host.className = 'diagram-block';
        answerEl.appendChild(host);

        try {
          const response = await fetch('/api/render-diagram', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              engine: part.engine,
              format: 'svg',
              diagram: part.code
            })
          });

          if (!response.ok) {
            throw new Error('Unable to fetch diagram');
          }

          const svgText = await response.text();
          host.innerHTML = svgText;
        } catch (error) {
          host.innerHTML = '<p>Could not render this diagram. Please check the engine or syntax.</p>';
          console.error(error);
        }
      }
    }

    statusEl.textContent = 'Done.';
  } catch (error) {
    statusEl.textContent = error.message;
    answerEl.innerHTML = '<p>Unable to load the response.</p>';
  }
});
