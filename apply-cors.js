const admin = require('firebase-admin');
const serviceAccount = require('./skillbridge-crm-firebase-adminsdk-fbsvc-18ba4e7b8a.json');

// Try both bucket name formats
const BUCKET_NAMES = [
  'skillbridge-crm.firebasestorage.app',
  'skillbridge-crm.appspot.com',
];

const corsConfig = [
  {
    origin: ['*'],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    responseHeader: [
      'Content-Type',
      'Authorization',
      'Content-Length',
      'User-Agent',
      'x-goog-resumable',
    ],
    maxAgeSeconds: 3600,
  },
];

async function tryBucket(bucketName) {
  console.log(`\nTrying bucket: ${bucketName}`);
  const app = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
      storageBucket: bucketName,
    },
    bucketName // unique app name
  );
  const bucket = admin.storage(app).bucket();
  try {
    await bucket.setCorsConfiguration(corsConfig);
    console.log(`✅ CORS applied to: ${bucketName}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed for ${bucketName}: ${err.message}`);
    return false;
  }
}

async function main() {
  for (const name of BUCKET_NAMES) {
    const ok = await tryBucket(name);
    if (ok) break;
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
