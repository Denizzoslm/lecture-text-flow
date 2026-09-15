/** Mise en page déterministe : aucun ajout de contenu ni résolution d'exercice. */
export function formatCourseText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n+/)
    .map((raw) => {
      const line = raw.trim().replace(/[ \t]+/g, " ");
      if (!line) return "";
      if (/^(?:chapitre|partie|leçon)\s+\S/i.test(line) && line.length < 110) {
        return `## ${escapeText(line)}`;
      }
      if (
        /^(?:définition|propriété|théorème|exemple|exercice|remarque|démonstration|correction)(?:\s+\d+)?\s*[:.\-–—]?$/i.test(
          line,
        )
      ) {
        return `### ${escapeText(line)}`;
      }
      // Only self-contained, unambiguous symbolic lines become display formulas.
      // Never turn prose, guessed fractions or OCR ambiguities into invented math.
      if (
        /[=<>≤≥≠]/.test(line) &&
        /^[\d\sA-Za-zα-ωΑ-Ω=<>≤≥≠+−\-*/×÷·.,():^²³⁰¹⁴⁵⁶⁷⁸⁹∞π√]+$/.test(line) &&
        !/[A-Za-z]{3,}/.test(line)
      ) {
        const tex = line
          .replace(
            /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,
            (digits) =>
              `^{${Array.from(digits)
                .map((digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit))
                .join("")}}`,
          )
          .replace(/−/g, "-")
          .replace(/×/g, "\\times ")
          .replace(/÷/g, "\\div ")
          .replace(/·/g, "\\cdot ")
          .replace(/≤/g, "\\leq ")
          .replace(/≥/g, "\\geq ")
          .replace(/≠/g, "\\neq ")
          .replace(/∞/g, "\\infty ")
          .replace(/π/g, "\\pi ");
        // A root's extent cannot be reliably inferred from plain OCR text.
        if (!tex.includes("√")) return `$$\n${tex}\n$$`;
      }
      const bullet = line.match(/^[•●]\s*(.+)$/);
      if (bullet) return `- ${escapeText(bullet[1] ?? "")}`;
      return escapeText(line);
    })
    .join("\n\n");
}

function escapeText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}[\]()#+.!|$~-])/g, "\\$1");
}
