/** `GABC...WXYZ`: the start and end of an address, for display. Empty string for no address. */
export function abbreviateAddress(address: string | undefined, edgeLength = 3): string {
  if (!address) return "";
  if (address.length <= edgeLength * 2) return address;
  return `${address.substring(0, edgeLength)}...${address.substring(address.length - edgeLength)}`;
}

export async function delay(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for anything that can't be a Stellar public key (empty, or not 56 characters). */
export function isInvalidPublicKey(pubkey: string | undefined): boolean {
  return !pubkey || pubkey.trim() === "" || pubkey.length !== 56;
}

export const downloadAttachment = async (url: string, fileName: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Error downloading file:', error);
  }
};
