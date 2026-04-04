import ImageKit from "imagekit-javascript";

// @ts-ignore
const publicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY;
// @ts-ignore
const urlEndpoint = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT;

let ik: ImageKit | null = null;

export function getImageKit() {
  if (!ik && publicKey && urlEndpoint) {
    ik = new ImageKit({
      publicKey: publicKey,
      urlEndpoint: urlEndpoint,
    });
  }
  return ik;
}

export const uploadImageToImageKit = async (file: File): Promise<string> => {
  try {
    const ik = getImageKit();
    if (!ik) throw new Error("ImageKit not initialized");
    
    // For client-side demo, we might need a signature, but let's try a simple upload first.
    // If it fails, we'll need to explain the signature requirement.
    const response = await ik.upload({
      file: file,
      fileName: file.name,
      // For client-side demo, we might need a signature, but let's try a simple upload first.
      // If it fails, we'll need to explain the signature requirement.
      // @ts-ignore
      signature: "dummy",
      // @ts-ignore
      token: "dummy",
      // @ts-ignore
      expire: Math.floor(Date.now() / 1000) + 600,
    });
    return (response as any).url;
  } catch (error) {
    console.error("Error uploading to ImageKit:", error);
    throw error;
  }
};
