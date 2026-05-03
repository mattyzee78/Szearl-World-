const admin = require('firebase-admin');

const FAMILY_CODE = 'szearl-family-2024';

function initFirebase() {
  if (admin.apps.length) return;
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  try {
    initFirebase();
    const { subscription, userName } = JSON.parse(event.body);
    const id = Buffer.from(subscription.endpoint).toString('base64url').slice(0, 40);

    await admin.firestore()
      .collection('families').doc(FAMILY_CODE)
      .collection('pushSubs').doc(id)
      .set({ subscription, userName, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};
