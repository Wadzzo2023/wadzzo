import { AppError, ErrorCodes } from "@wadzzo/errors";
export async function fetchPubkeyfromEmail(email: string): Promise<string> {
  const response = await fetch(`https://accounts.action-tokens.com/api/pub?email=${email}`);
  if (response.ok) {
    const data = (await response.json()) as { publicKey: string };
    return data.publicKey;
  } else {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "Email don't have a pubkey",
    });
  }
}

export async function fetchUsersByPublicKeys(
  publicKeys: string[],
): Promise<{ email: string; publicKey: string }[]> {
  const body = JSON.stringify({ publicKeys });
  const response = await fetch("https://accounts.action-tokens.com/api/pubs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body,
  });

  if (response.ok) {
    const data = (await response.json()) as {
      email: string;
      publicKey: string;
    }[];
    return data;
  } else {
    // const data = await response.json();
    // console.log("Error fetching public keys:", data);
    // throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Public keys not found x" });
    return [];
  }
}
