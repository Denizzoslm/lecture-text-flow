import { Check, Loader2 } from "lucide-react";

/** Progression du pipeline (spec §25) — jamais d'écran vide pendant le traitement. */
export const PIPELINE_STEPS = [
  "Analyse de la photo",
  "Détection du contenu",
  "Lecture des mathématiques",
  "Vérification croisée",
  "Mise en page",
  "Génération du PDF",
] as const;

export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;

export function ProgressSteps({
  current,
  detail,
}: {
  /** Index de l'étape en cours ; 6 = terminé. */
  current: number;
  detail?: string;
}) {
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {PIPELINE_STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            className={`flex items-center gap-2 text-xs ${
              done ? "text-sage" : active ? "text-ink" : "text-ink-soft/60"
            }`}
          >
            <span className="flex size-4 flex-none items-center justify-center">
              {done ? (
                <Check className="size-3.5" />
              ) : active ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            <span>{label}</span>
            {active && detail ? (
              <span className="font-mono text-[11px] text-ink-soft">· {detail}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
