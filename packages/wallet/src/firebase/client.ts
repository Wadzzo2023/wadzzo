import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

import { firebaseConfig } from "./config";

const authApp = initializeApp(firebaseConfig, "authApp");

export const firebaseStorage = getStorage(authApp);
export const firebaseAuth = getAuth(authApp);
