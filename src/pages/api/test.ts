/* eslint-disable */
import type { NextApiRequest, NextApiResponse } from "next";
// import { Client, Environment } from "square";

import { verifyAppleToken } from "package/connect_wallet/src/lib/firebase/admin/apple-verify";
import { verifyIdToken } from "package/connect_wallet/src/lib/firebase/admin/auth";
import { initAdmin } from "package/connect_wallet/src/lib/firebase/admin/config";

export const maxDuration = 3 * 60 * 1000;

// (BigInt.prototype as any).toJSON = function () {
//   return this.toString();
// };

// const { paymentsApi } = new Client({
//   accessToken: "YOUR ACCESS TOKEN HERE",
//   environment: "sandbox" as any,
// });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const admin = initAdmin();
  const auth = admin.auth();

  const uids = [
    "9r31NeEdJ0dF0pV1nR6Q23X2X853",
    "lrwi56ylIthGiRF3YPjRAvlOP643",
    "RpQKCiIvBcgPdMoIadJlgCcchF13",
    "U0mmtkSxXkg8v8SRHogeEbCuzRt1",
    "xr4GQt7OJadxTRIYaOEBnupXSy62",
  ];

  const users = [];
  for (const uid of uids) {
    const user = await auth.getUser(uid);
    users.push(user);
  }

  const user = await auth.getUser("2Z8b1ZT6R6UrdTB7fTv5JV75dc93");
  users.push(user);

  return res.status(200).json({ message: users });
  try {
    const appleUser = await verifyAppleToken(
      "***REMOVED***",
    );
    const admin = initAdmin();
    const auth = admin.auth();
    const firebaseToken = await admin.auth().createCustomToken(appleUser.sub);

    try {
      // Try to get existing user first
      const firebaseUser = await auth.getUserByProviderUid(
        "apple.com",
        appleUser.sub,
      );

      console.log(firebaseToken, "firebase uer");
      return firebaseUser;
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        // Create new Firebase user if they don't exist
        const newUser = await auth.createUser({
          uid: appleUser.sub, // Or generate a new UID
          email: appleUser.email,
          displayName: appleUser.name,
        });

        await admin.auth().updateUser(newUser.uid, {
          providerToLink: {
            uid: appleUser.sub,
            providerId: "apple.com",
          },
        });
      }
      throw error;
    }

    const uid = await verifyIdToken(firebaseToken);

    console.log("uid", uid, appleUser.email);
    return res.status(200).json(firebaseToken);
  } catch (e) {
    console.log(e);
    return res
      .status(500)
      .json({ error: "An error occurred while processing your request" });
  }
}
