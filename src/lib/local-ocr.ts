import { createWorker, OEM, PSM } from "tesseract.js";
import { formatCourseText } from "./course-format";

/** No image leaves the device. Only the OCR engine/language files are downloaded. */
export async function transcribeLocally(image: string, onProgress: (progress: number) => void) {
  const worker = await createWorker("fra+eng", OEM.LSTM_ONLY, {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress(Math.round(message.progress * 100));
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(image, { rotateAuto: true });
    if (!data.text.trim()) {
      throw new Error(
        "Aucun texte détecté. Ajustez le recadrage ou utilisez une photo plus nette. Vous pouvez aussi saisir le texte manuellement.",
      );
    }
    const markdown = formatCourseText(data.text);
    return { markdown, confidence: Math.round(data.confidence) };
  } finally {
    await worker.terminate();
  }
}
