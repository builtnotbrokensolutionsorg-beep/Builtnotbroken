// /api/contact.js
// Handles contact form submissions, quote-lead notifications, and contractor
// registrations. Uploads any attached photos to ImgBB (full quality, hosted
// link), then emails Evan via Resend with all the details.
//
// Requires these Vercel environment variables:
//   IMGBB_API_KEY   - from https://imgbb.com/account/api
//   RESEND_API_KEY  - from https://resend.com/api-keys
//
// Sends FROM:  leads@builtnotbrokensolutions.org  (requires domain verified in Resend)
// Sends TO:    yycstuccostonerepair@gmail.com

const OWNER_EMAIL = 'yycstuccostonerepair@gmail.com';
const FROM_EMAIL = 'Built Not Broken Leads <leads@builtnotbrokensolutions.org>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const imgbbKey = process.env.IMGBB_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!resendKey) {
    return res.status(500).json({
      error: 'Server is not configured for sending email.',
      setup: 'Add RESEND_API_KEY in Vercel → Project → Settings → Environment Variables, then redeploy.'
    });
  }

  try {
    const body = req.body || {};
    const {
      type,        // 'contact' | 'contractor'
      name,
      phone,
      email,
      message,     // contact form message, or pre-built quote lead summary
      photos,      // [{ name, type, data }] - base64 data, no data: prefix
      // contractor-specific fields
      company,
      trade,
      areas,
      plan
    } = body;

    // ---- 1. Upload any photos to ImgBB ----
    let photoLinks = [];
    if (imgbbKey && Array.isArray(photos) && photos.length > 0) {
      const uploads = await Promise.all(
        photos.slice(0, 3).map(async (photo) => {
          try {
            const form = new URLSearchParams();
            form.append('image', photo.data); // base64 string, no prefix
            if (photo.name) form.append('name', photo.name);

            const uploadRes = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: form.toString()
            });
            const uploadData = await uploadRes.json();
            if (uploadData?.data?.url) return uploadData.data.url;
            console.error('ImgBB upload failed for', photo.name, uploadData);
            return null;
          } catch (e) {
            console.error('ImgBB upload error:', e);
            return null;
          }
        })
      );
      photoLinks = uploads.filter(Boolean);
    }

    // ---- 2. Build email content based on submission type ----
    let subject = '';
    let htmlBody = '';

    if (type === 'contractor') {
      subject = `New Partner Contractor Registration — ${trade || 'Unknown Trade'}`;
      htmlBody = `
        <h2>New Contractor Partner Registration</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company || '—')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || '—')}</p>
        <p><strong>Email:</strong> ${escapeHtml(email || '—')}</p>
        <p><strong>Trade Specialty:</strong> ${escapeHtml(trade || '—')}</p>
        <p><strong>Service Areas:</strong> ${escapeHtml(areas || '—')}</p>
        <p><strong>Preferred Plan:</strong> ${plan === 'revenue-share' ? '8% Revenue Share' : '$100 Per Lead (Flat Fee)'}</p>
      `;
    } else {
      // 'contact' covers both the contact form AND quote-lead notifications
      const isQuoteLead = (message || '').includes('NEW QUOTE LEAD');
      subject = isQuoteLead
        ? `New Quote Lead — ${name || 'Unknown'}`
        : `New Website Message — ${name || 'Unknown'}`;

      htmlBody = `
        <h2>${isQuoteLead ? 'New Quote Lead' : 'New Contact Message'}</h2>
        <p><strong>Name:</strong> ${escapeHtml(name || '—')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || '—')}</p>
        <p><strong>Email:</strong> ${escapeHtml(email || '—')}</p>
        <p><strong>Details:</strong></p>
        <pre style="white-space:pre-wrap;font-family:inherit;background:#f5f5f5;padding:12px;border-radius:4px;">${escapeHtml(message || '—')}</pre>
      `;
    }

    if (photoLinks.length > 0) {
      htmlBody += `
        <p><strong>Photos (${photoLinks.length}):</strong></p>
        <ul>
          ${photoLinks.map((url, i) => `<li><a href="${url}">View Photo ${i + 1}</a></li>`).join('')}
        </ul>
      `;
    } else if (Array.isArray(photos) && photos.length > 0) {
      htmlBody += `<p><em>Note: ${photos.length} photo(s) were submitted but could not be uploaded.</em></p>`;
    }

    // ---- 3. Send via Resend ----
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [OWNER_EMAIL],
        reply_to: email || undefined,
        subject,
        html: htmlBody
      })
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error('Resend error:', resendData);
      return res.status(502).json({
        error: resendData?.message || 'Failed to send email notification.'
      });
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

