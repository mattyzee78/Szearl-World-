const admin = require('firebase-admin');
const webpush = require('web-push');
const Anthropic = require('@anthropic-ai/sdk');

const FAMILY_CODE = 'szearl-family-2024';

function initFirebase() {
  if (admin.apps.length) return;
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

exports.handler = async (event) => {
  if (event.headers['x-brief-secret'] !== process.env.BRIEF_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    initFirebase();
    const db = admin.firestore();
    const now = new Date();
    const tz = 'Australia/Sydney';
    const todayStr = now.toLocaleDateString('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
    const todayDate = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndDate = weekEnd.toLocaleDateString('en-CA', { timeZone: tz });

    const fam = db.collection('families').doc(FAMILY_CODE);

    // Fetch events for next 7 days
    const evSnap = await fam.collection('events')
      .where('date', '>=', todayDate)
      .where('date', '<=', weekEndDate)
      .orderBy('date').orderBy('time')
      .get();
    const events = evSnap.docs.map(d => d.data());

    // Fetch all lists, filter to ones with pending items
    const listSnap = await fam.collection('lists').get();
    const lists = listSnap.docs
      .map(d => d.data())
      .filter(l => Array.isArray(l.items) && l.items.some(i => !i.done));

    // Fetch notes from last 48 hours
    const notesCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const notesSnap = await fam.collection('notes')
      .where('createdAt', '>=', notesCutoff)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    const notes = notesSnap.docs.map(d => d.data());

    // Build context for Claude
    const todayEvents = events.filter(e => e.date === todayDate);
    const upcomingEvents = events.filter(e => e.date !== todayDate);

    const fmtEvent = e =>
      `• ${e.title}${e.time ? ' at ' + e.time : ''}${e.location ? ' @ ' + e.location : ''}` +
      `${e.members && e.members.length ? ' (' + e.members.join(', ') + ')' : ''}`;

    const context = [
      `Today (${todayStr}): ${todayEvents.length ? todayEvents.map(fmtEvent).join('\n') : 'No events today'}`,
      upcomingEvents.length ? `Upcoming this week:\n${upcomingEvents.map(e => `• ${e.date}: ${e.title}`).join('\n')}` : '',
      lists.length ? `Pending lists:\n${lists.map(l => `• ${l.name}: ${l.items.filter(i => !i.done).map(i => i.text).slice(0, 5).join(', ')}`).join('\n')}` : 'No pending list items',
      notes.length ? `Recent family notes:\n${notes.map(n => `• ${n.author}: "${n.text}"`).join('\n')}` : 'No recent notes'
    ].filter(Boolean).join('\n\n');

    // Generate brief with Claude
    const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Write a warm, friendly morning brief for Matt from the Szearl family app.\n\n${context}\n\nKeep it under 120 words, conversational, and positive. Lead with today's events. Mention the most important list items and any notes from Katharine. No bullet points — write it as natural flowing text.`
      }]
    });
    const brief = msg.content[0].text;

    // Store in Firestore so the app can show it
    await fam.collection('briefs').doc(todayDate).set({
      text: brief,
      date: todayDate,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send Web Push to all subscriptions
    webpush.setVapidDetails(
      'mailto:hello@szearl.family',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const subsSnap = await fam.collection('pushSubs').get();
    await Promise.all(subsSnap.docs.map(async doc => {
      try {
        await webpush.sendNotification(doc.data().subscription, JSON.stringify({
          title: '☀️ Morning Brief',
          body: brief.slice(0, 120) + (brief.length > 120 ? '…' : '')
        }));
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) await doc.ref.delete();
      }
    }));

    return { statusCode: 200, body: JSON.stringify({ ok: true, date: todayDate }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: e.message };
  }
};
