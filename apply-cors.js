const admin = require('firebase-admin');
const serviceAccount = require('./skillbridge-crm-firebase-adminsdk-fbsvc-18ba4e7b8a.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'skillbridge-crm.appspot.com'
});

const bucket = admin.storage().bucket();

const corsConfig = [
  {
    origin: ['*'],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAgeSeconds: 3600
  }
];

bucket.setCorsConfiguration(corsConfig)
  .then(() => {
    console.log('Successfully applied CORS configuration to the bucket.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to set CORS:', error);
    process.exit(1);
  });
