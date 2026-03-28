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
