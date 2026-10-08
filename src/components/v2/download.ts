/** Saves CSV text as a file from the browser. */
export function downloadCsv(fileName: string, csv: string) {
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: fileName });
  link.click();
  URL.revokeObjectURL(link.href);
}
