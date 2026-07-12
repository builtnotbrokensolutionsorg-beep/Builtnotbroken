// /api/gallery-add.js
// Adds a new photo to the "Completed Work" gallery.
// Flow: verify PIN -> upload photo to ImgBB -> commit updated gallery.json to GitHub.
//
// Requires these Vercel environment variables:
//   IMGBB_API_KEY          (already set for the quote/contact forms)
//   GALLERY_UPLOAD_PIN     (a simple PIN Evan chooses, used to gate uploads)
//   GITHUB_TOKEN           (fine-grained PAT, Contents: Read and write, scoped to this repo only)

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const GITHUB_REPO = 'builtnotbrokensolutionsorg-beep/Builtnotbroken';
const GITHUB_BRANCH = 'main';
const GALLERY_PATH = 'data/gallery.json';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const imgbbKey = process.env.IMGBB_API_KEY;
  const uploadPin = process.env.GALLERY_UPLOAD_PIN;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!imgbbKey || !uploadPin || !githubToken) {
    console.error('Missing IMGBB_API_KEY, GALLERY_UPLOAD_PIN, or GITHUB_TOKEN');
    return res.status(500).json({ error: 'Server misconfiguration: missing required keys.' });
  }

  try {
    const { pin, photo, caption, trade } = req.body || {};

    if (!pin || pin !== uploadPin) {
      return res.status(401).json({ error: 'Incorrect PIN.' });
    }
    if (!photo || !photo.data) {
      return res.status(400).json({ error: 'No photo provided.' });
    }
    if (!caption || !caption.trim()) {
      return res.status(400).json({ error: 'Please add a short caption.' });
    }

    // 1. Upload photo to ImgBB
    const base64Data = photo.data.split(',').pop();
    const form = new URLSearchParams();
    form.append('image', base64Data);
    if (photo.name) form.append('name', photo.name);

    const imgbbRes = await fetch(`${IMGBB_UPLOAD_URL}?key=${imgbbKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const imgbbData = await imgbbRes.json();

    if (!imgbbRes.ok || !imgbbData?.data?.url) {
      console.error('ImgBB upload failed:', imgbbData);
      return res.status(502).json({ error: 'Photo upload failed.' });
    }

    const photoUrl = imgbbData.data.url;
    const thumbUrl = imgbbData.data.thumb?.url || photoUrl;

    // 2. Fetch current gallery.json from GitHub (need its sha to update it)
    const ghHeaders = {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github+json',
    };

    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${GALLERY_PATH}?ref=${GITHUB_BRANCH}`,
      { headers: ghHeaders }
    );

    let gallery = [];
    let sha = undefined;
    if (getRes.ok) {
      const getData = await getRes.json();
      sha = getData.sha;
      const decoded = Buffer.from(getData.content, 'base64').toString('utf-8');
      try {
        gallery = JSON.parse(decoded);
      } catch {
        gallery = [];
      }
    }

    // 3. Append new entry
    gallery.unshift({
      url: photoUrl,
      thumb: thumbUrl,
      caption: caption.trim(),
      trade: trade || '',
      date: new Date().toISOString(),
    });

    const newContentB64 = Buffer.from(JSON.stringify(gallery, null, 2)).toString('base64');

    const putBody = {
      message: `Add completed-work photo: ${caption.trim().slice(0, 60)}`,
      content: newContentB64,
      branch: GITHUB_BRANCH,
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${GALLERY_PATH}`,
      {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      }
    );

    if (!putRes.ok) {
      const putErr = await putRes.json();
      console.error('GitHub commit failed:', putErr);
      return res.status(502).json({ error: 'Photo uploaded but failed to save to gallery.' });
    }

    return res.status(200).json({ success: true, url: photoUrl });
  } catch (err) {
    console.error('gallery-add.js error:', err);
    return res.status(500).json({ error: 'Unexpected server error adding photo.' });
  }
}
