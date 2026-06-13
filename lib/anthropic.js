// Server-side Anthropic Messages client. Returns full text; optional onChunk.
const API_URL = 'https://api.anthropic.com/v1/messages';

export async function streamMessage({ apiKey, model, system, prompt, maxTokens = 32000, temperature = 1 }, onChunk) {
  if (!apiKey) throw new Error('No Anthropic API key set (Settings).');
  // Settings may arrive as a string from the form; coerce to a valid integer.
  let maxTok = parseInt(maxTokens, 10);
  if (!Number.isFinite(maxTok) || maxTok < 1024) maxTok = 32000;
  if (maxTok > 64000) maxTok = 64000;
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model, max_tokens: maxTok, temperature, stream: true, system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch {}
    throw new Error(`Anthropic API error ${res.status}${detail ? ': ' + detail : ''}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let ev; try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta?.text) {
        full += ev.delta.text;
        if (onChunk) onChunk(ev.delta.text);
      }
      if (ev.type === 'error') throw new Error(ev.error?.message || 'Streaming error');
    }
  }
  return full;
}

export async function message(opts) {
  return streamMessage(opts, null);
}

export function extractHtml(text) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const idx = t.search(/<!doctype html|<html/i);
  if (idx > 0) t = t.slice(idx);
  return t;
}

export function extractJsonLoose(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('No JSON in response');
  return JSON.parse(text.slice(a, b + 1));
}
