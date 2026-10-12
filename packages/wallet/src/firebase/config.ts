/**
 * Firebase web config. Literal `process.env.NEXT_PUBLIC_*` reads, so Next.js
 * inlines them into the browser bundle.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_AUTH_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_AUTH_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_AUTH_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_AUTH_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_AUTH_APP_ID!,
};
