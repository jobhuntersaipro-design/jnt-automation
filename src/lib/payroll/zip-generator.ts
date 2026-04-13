import JSZip from "jszip";

interface PayslipFile {
  fileName: string;
  buffer: Buffer;
}

/**
 * Generate a ZIP file containing multiple payslip PDFs.
 */
export async function generatePayslipZip(payslips: PayslipFile[]): Promise<Buffer> {
  const zip = new JSZip();

  for (const payslip of payslips) {
    zip.file(payslip.fileName, new Uint8Array(payslip.buffer));
  }

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  return Buffer.from(zipBuffer);
}
