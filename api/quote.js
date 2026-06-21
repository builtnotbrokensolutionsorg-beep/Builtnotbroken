// /api/quote.js
// Proxies AI quote requests to the Anthropic API.
// Requires ANTHROPIC_API_KEY set in Vercel project environment variables.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is not configured for AI quotes.',
      setup: 'Add ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables, then redeploy.'
    });
  }

  try {
    const { model, max_tokens, messages } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing or invalid "messages" in request body.' });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: max_tokens || 1000,
        messages
      })
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', data);
      return res.status(anthropicRes.status).json({
        error: data?.error?.message || 'Anthropic API request failed.'
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('quote.js error:', err);
    return res.status(500).json({ error: 'Unexpected server error generating quote.' });
  }
}
