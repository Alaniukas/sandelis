import { jsPDF } from "jspdf";
import type { OrderLabelData } from "./labels";

/** Atskiras QR lapas A4 formatu (ne ant 90×60 mm BarTender šablono). */
export async function buildQrPdf(label: OrderLabelData): Promise<Buffer> {
  const pageW = 210;
  const pageH = 297;
  const qrSize = 140;
  const qrX = (pageW - qrSize) / 2;
  const qrY = 78;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(label.kodas, pageW / 2, 48, { align: "center" });

  doc.addImage(label.qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const urlY = qrY + qrSize + 14;
  doc.text(label.qr, pageW / 2, urlY, {
    align: "center",
    maxWidth: pageW - 30,
  });

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Nuskenuok telefonu — atsidaro užsakymo info sandėlyje", pageW / 2, pageH - 20, {
    align: "center",
  });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
