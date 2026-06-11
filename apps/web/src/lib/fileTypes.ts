const editableExtensions = new Set([
  ".aux",
  ".bbx",
  ".bib",
  ".bst",
  ".cbx",
  ".cls",
  ".csv",
  ".gitignore",
  ".json",
  ".log",
  ".md",
  ".sty",
  ".tex",
  ".txt",
  ".xml",
  ".yaml",
  ".yml"
]);

const imageExtensions = new Set([".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]);
const binaryExtensions = new Set([".bmp", ".eps", ".gif", ".jpg", ".jpeg", ".pdf", ".png", ".webp", ".zip"]);

export function extensionForPath(filePath: string): string {
  const basename = filePath.split("/").at(-1)?.toLowerCase() ?? filePath.toLowerCase();
  if (basename === ".gitignore") return ".gitignore";
  const match = basename.match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export function isEditableTextFile(filePath: string): boolean {
  const extension = extensionForPath(filePath);
  if (!extension) return true;
  if (editableExtensions.has(extension)) return true;
  return !binaryExtensions.has(extension) && !imageExtensions.has(extension);
}

export function isImageFile(filePath: string): boolean {
  return imageExtensions.has(extensionForPath(filePath));
}
