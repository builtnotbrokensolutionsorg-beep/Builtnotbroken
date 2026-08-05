// api/portfolio-add.js
// Uploads before/after photos to ImgBB, then commits the new entry to data/portfolio.json via GitHub API.
// Same pattern as gallery-add.js — classic GitHub token required (fine-grained tokens fail with 403).

export const config = { runtime: 'edge' };

const IMGBB_KEY   = process.env.IMGBB_API_KEY;
const GH_TOKEN    = process.env.GITHUB_TOKEN;
const GH_REPO     = 'builtnotbrokensolutionsorg-beep/Builtnotbroken';
const DATA_PATH   = 'data/portfolio.json';
const UPLOAD_PIN  = process.env.GALLERY_UPLOAD_PIN || '0509';

function stripDataUri(str) {
  return str.includes(',') ? str.split(',')[1] : str;
}

async function uploadToImgBB(base64, filename) {
  const body = new URLSearchParams();
  body.append('key', IMGBB_KEY);
  body.append('image', stripDataUri(base64));
  body.append('name', filename.replace(/\.[^.]+$/, ''));

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body
  });
  const d = await res.json();
  if (!d.success) throw new Error('ImgBB upload failed: ' + JSON.stringify(d));
  return d.data.url;
}

async function getFileSHA() {
  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${DATA_PATH}`,
    { headers: { Authorization: `token ${GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
  );
  if (res.status === 404) return { sha: null, items: [] };
  const d = await res.json();
  const content = JSON.parse(atob(d.content.replace(/\n/g, '')));
  return { sha: d.sha, items: content };
}

async function commitFile(items, sha) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(items, null, 2))));
  const body = {
    message: `Add portfolio job: ${items[0]?.title || 'new entry'}`,
    content,
    ...(sha ? { sha } : {})
  };
  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${DATA_PATH}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${GH_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  const d = await res.json();
  if (!d.content) throw new Error('GitHub commit failed: ' + JSON.stringify(d));
  return d;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { title, desc, location, before, after, pin } = await req.json();

    // PIN check (allow server-side or client-side pre-check)
    if (pin && pin !== UPLOAD_PIN) {
      return new Response(JSON.stringify({ error: 'Invalid PIN' }), { status: 403 });
    }

    if (!title || !before?.data || !after?.data) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    // Upload both photos in parallel
    const [beforeUrl, afterUrl] = await Promise.all([
      uploadToImgBB(before.data, before.name || 'before.jpg'),
      uploadToImgBB(after.data, after.name || 'after.jpg')
    ]);

    // Get current file + SHA
    const { sha, items } = await getFileSHA();

    // Prepend new entry (newest first)
    const newEntry = {
      id: Date.now(),
      title,
      desc: desc || '',
      location: location || '',
      date: new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long' }),
      beforeUrl,
      afterUrl
    };

    const updated = [newEntry, ...items];

    await commitFile(updated, sha);

    return new Response(JSON.stringify({ success: true, entry: newEntry }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('portfolio-add error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
