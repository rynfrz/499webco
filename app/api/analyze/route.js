import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { message, extractJsonLoose } from '@/lib/anthropic';
import { buildAnalysisPrompt } from '@/lib/promptBuilder';

export const runtime = 'nodejs';
export const maxDuration = 60;

function heuristic(fetched) {
  const flags = [];
  if (!fetched.hasViewport) flags.push('Not mobile friendly — missing viewport meta tag');
  if (!fetched.title) flags.push('Missing page title (bad for SEO)');
  if (fetched.htmlLength < 5000) flags.push('Very thin content — little for Google to index');
  if (fetched.status >= 400) flags.push(`Site returns HTTP ${fetched.status}`);
  if (!/review|testimonial/i.test(fetched.text)) flags.push('No customer reviews shown');
  if (!/book|schedule|order|call now|contact/i.test(fetched.text)) flags.push('No clear call to action');
  const score = Math.max(8, 72 - flags.length * 11);
  return { score, redFlags: flags, designIssues: ['Dated visual design'], seoIssues: fetched.title ? [] : ['Missing title/meta'], conversionIssues: [], extracted: { services: [], about: '', phone: '', address: '', hours: '' }, verdict: flags.length >= 3 ? 'Three or more red flags — build it.' : 'Borderline.' };
}

export async function POST(req) {
  try {
    await requireUser();
    const { business } = await req.json();
    let url = business.currentUrl;
    if (!url) return NextResponse.json({ error: 'No current website URL' }, { status: 400 });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    let fetched;
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36' }, signal: AbortSignal.timeout(20000) });
      const html = await res.text();
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
      fetched = {
        status: res.status, title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '',
        hasViewport: /name=["']viewport["']/i.test(html), htmlLength: html.length, text, htmlHead: html.slice(0, 6000)
      };
    } catch (e) {
      return NextResponse.json({ error: 'Could not fetch that site: ' + e.message }, { status: 400 });
    }

    const s = await getSettings();
    let analysis;
    if (s.anthropicKey) {
      const raw = await message({ apiKey: s.anthropicKey, model: s.model || 'claude-sonnet-4-6', system: 'You are a sharp website auditor. Output only valid JSON.', prompt: buildAnalysisPrompt(business, fetched), maxTokens: 2000, temperature: 0.3 });
      analysis = extractJsonLoose(raw);
    } else {
      analysis = heuristic(fetched);
    }
    return NextResponse.json({ analysis });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
