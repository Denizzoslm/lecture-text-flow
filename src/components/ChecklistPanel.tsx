import { AlertTriangle, Check, X } from "lucide-react";
import type { ValidationResult } from "@/lib/validation";

/** Contrôle final avant export (spec §20). */
export function ChecklistPanel({
  result,
  acknowledged,
  onAcknowledge,
}: {
  result: ValidationResult;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  return (
    <div className="sheet p-3">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-tight text-ink-soft">
        Contrôle final
      </p>
      <ul className="space-y-1">
        {result.items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 flex-none">
              {item.state === "ok" ? (
                <Check className="size-3.5 text-sage" />
              ) : item.state === "warn" ? (
                <AlertTriangle className="size-3.5 text-brick" />
              ) : (
                <X className="size-3.5 text-destructive" />
              )}
            </span>
            <span className={item.state === "fail" ? "text-destructive" : "text-ink"}>
              {item.label}
              {item.detail ? <span className="text-ink-soft"> — {item.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      {result.blocked ? (
        <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          Des points bloquants doivent être corrigés avant l'export.
        </p>
      ) : result.toVerify > 0 ? (
        <label className="mt-3 flex items-start gap-2 rounded border border-brick/40 bg-brick/10 p-2 text-xs text-ink">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledge(e.target.checked)}
            className="mt-0.5 size-3.5 accent-[hsl(var(--brick))]"
          />
          <span>
            ⚠️ {result.toVerify} élément(s) nécessitent votre vérification. Je confirme les avoir
            contrôlés dans la zone ORIGINAL.
          </span>
        </label>
      ) : (
        <p className="mt-3 rounded border border-sage/40 bg-sage/10 p-2 text-xs text-ink">
          ✓ Document prêt pour l'export.
        </p>
      )}
    </div>
  );
}
