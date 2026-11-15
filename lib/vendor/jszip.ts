import "./jszip.min.js";

type ZipArchive = {
  file(path: string): { async(type: "string"): Promise<string> } | null;
  file(path: string, data: string): ZipArchive;
  generateAsync(options: { type: "blob"; mimeType?: string }): Promise<Blob>;
};
type ZipConstructor = { loadAsync(data: ArrayBuffer | Uint8Array | Blob): Promise<ZipArchive> };

const JSZip = (globalThis as typeof globalThis & { JSZip: ZipConstructor }).JSZip;
export default JSZip;
