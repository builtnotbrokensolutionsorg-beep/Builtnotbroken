// /api/contact.js
// Handles quote/contact form submissions:
// - Uploads any attached photos to ImgBB
// - Sends a lead notification email via Resend to yycstuccostonerepair@gmail.com
//
// Requires these Vercel environment variables:
//   IMGBB_API_KEY
//   RESEND_API_KEY

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const RESEND_URL = 'https://api.resend.com/emails';
const NOTIFY_EMAIL = 'yycstuccostonerepair@gmail.com';
const FROM_EMAIL = 'leads@builtnotbrokensolutions.org';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const imgbbKey = process.env.IMGBB_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!imgbbKey || !resendKey) {
    console.error('Missing IMGBB_API_KEY or RESEND_API_KEY environment variable');
    return res.status(500).json({ error: 'Server misconfiguration: missing API keys.' });
  }

  try {
    const {
      type,
      name,
      phone,
      email,
      message,
      trade,
      company,
      address,
      photos, // [{ name, type, data(base64) }]
    } = req.body || {};

    if (!name || (!email && !phone)) {
      return res.status(400).json({ error: 'Missing required contact information.' });
    }

    // Upload photos to ImgBB (if any)
    const photoLinks = [];
    if (Array.isArray(photos) && photos.length > 0) {
      for (const photo of photos) {
        try {
          const base64Data = (photo.data || '').split(',').pop(); // strip data URL prefix if present
          const form = new URLSearchParams();
          form.append('image', base64Data);
          if (photo.name) form.append('name', photo.name);

          const imgbbRes = await fetch(`${IMGBB_UPLOAD_URL}?key=${imgbbKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
          });

          const imgbbData = await imgbbRes.json();

          if (imgbbRes.ok && imgbbData?.data?.url) {
            photoLinks.push(imgbbData.data.url);
          } else {
            console.error('ImgBB upload failed for a photo:', imgbbData);
          }
        } catch (photoErr) {
          console.error('Error uploading photo to ImgBB:', photoErr);
        }
      }
    }

    // Build the notification email
    const subject = `New ${escapeHtml(type || 'Lead')} — ${escapeHtml(name)}`;

    const detailRows = [
      ['Type', type],
      ['Name', name],
      ['Phone', phone],
      ['Email', email],
      ['Trade', trade],
      ['Company', company],
      ['Address', address],
    ]
      .filter(([, v]) => v)
      .map(
        ([label, v]) =>
          `<tr><td style="padding:4px 10px 4px 0;font-weight:bold;">${escapeHtml(
            label
          )}:</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`
      )
      .join('');

    const photosHtml =
      photoLinks.length > 0
        ? `<p><strong>Photos:</strong></p><ul>${photoLinks
            .map((url) => `<li><a href="${url}">${url}</a></li>`)
            .join('')}</ul>`
        : '';

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
        <h2 style="margin-bottom:10px;">New submission from Built Not Broken Solutions</h2>
        <table>${detailRows}</table>
        ${
          message
            ? `<p style="margin-top:16px;"><strong>Message:</strong><br>${escapeHtml(message).replace(
                /\n/g,
                '<br>'
              )}</p>`
            : ''
        }
        ${photosHtml}
      </div>
    `;

    const resendRes = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: NOTIFY_EMAIL,
        reply_to: email || undefined,
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error('Resend email error:', resendData);
      return res.status(502).json({ error: 'Failed to send notification email.' });
    }

    return res.status(200).json({ success: true, photoLinks });
  } catch (err) {
    console.error('contact.js error:', err);
    return res.status(500).json({ error: 'Unexpected server error sending message.' });
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
