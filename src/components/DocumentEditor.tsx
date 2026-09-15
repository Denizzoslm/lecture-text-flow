import { useCallback, useEffect, useRef, useState } from "react";
import katex from "katex";
import { printDocument } from "@/lib/pdf";
import { toast } from "sonner";
import { GraphEditorPanel } from "./GraphEditorPanel";
import type { GraphSpec } from "@/lib/markdown";
import { graphToDataUrl } from "@/lib/graph-draw";

type EditorTool = "text" | "move";

/** A separate DOM editing surface protects the React-rendered source document. */
export function DocumentEditor({
  source,
  title,
  meta,
  author,
  onClose,
}: {
  source: HTMLElement;
  title: string;
  meta: string;
  author: string;
  onClose: (html: string) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const [formula, setFormula] = useState<string | null>(null);
  const [selected, setSelected] = useState<HTMLElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const undoHistory = useRef<string[]>([]);
  const redoHistory = useRef<string[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [tool, setTool] = useState<EditorTool>("text");
  const [graphEdit, setGraphEdit] = useState<{ figure: HTMLElement; spec: GraphSpec } | null>(null);
  const toolRef = useRef<EditorTool>("text");

  const saveSnapshot = useCallback(() => {
    if (!editor.current) return;
    undoHistory.current = [...undoHistory.current.slice(-49), editor.current.innerHTML];
    redoHistory.current = [];
    setUndoCount(undoHistory.current.length);
    setRedoCount(0);
  }, []);

  const undo = useCallback(() => {
    const root = editor.current;
    const previous = undoHistory.current.pop();
    if (!root || previous === undefined) return;
    redoHistory.current.unshift(root.innerHTML);
    root.innerHTML = previous;
    setSelected(null);
    setUndoCount(undoHistory.current.length);
    setRedoCount(redoHistory.current.length);
  }, []);

  const redo = useCallback(() => {
    const root = editor.current;
    const next = redoHistory.current.shift();
    if (!root || next === undefined) return;
    undoHistory.current.push(root.innerHTML);
    root.innerHTML = next;
    setSelected(null);
    setUndoCount(undoHistory.current.length);
    setRedoCount(redoHistory.current.length);
  }, []);

  useEffect(() => {
    if (!editor.current) return;
    const clone = source.cloneNode(true) as HTMLElement;
    const originals = source.querySelectorAll("canvas");
    clone.querySelectorAll("canvas").forEach((canvas, i) => {
      const image = document.createElement("img");
      image.src = originals[i]!.toDataURL("image/png");
      image.alt = originals[i]!.getAttribute("aria-label") || "Graphique";
      image.style.cssText = "max-width:100%;height:auto";
      canvas.replaceWith(image);
    });
    removeDragArtifacts(clone);
    editor.current.innerHTML = clone.innerHTML;
    undoHistory.current = [];
    redoHistory.current = [];
    setUndoCount(0);
    setRedoCount(0);
    editor.current
      .querySelectorAll(".katex, figure")
      .forEach((element) => element.setAttribute("contenteditable", "false"));
    editor.current.querySelectorAll<HTMLElement>("figure[data-graph-spec]").forEach((figure) => {
      if (figure.querySelector(".graph-inline-edit")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "graph-inline-edit";
      button.textContent = "✎ Modifier";
      button.setAttribute("contenteditable", "false");
      button.setAttribute("draggable", "false");
      figure.append(button);
    });
    const root = editor.current;
    const movableSelector = ".editor-movable";
    let dragged: HTMLElement | null = null;
    Array.from(root.children).forEach((child) => {
      const element = child as HTMLElement;
      element.draggable = toolRef.current === "move";
      element.classList.add("editor-movable");
      element.classList.toggle("editor-draggable", toolRef.current === "move");
    });
    const onDragStart = (event: DragEvent) => {
      if (toolRef.current !== "move") return;
      const target = (event.target as HTMLElement).closest(movableSelector) as HTMLElement | null;
      if (!target || target.parentElement !== root) return;
      saveSnapshot();
      dragged = target;
      target.classList.add("editor-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-digital-math-block", target.dataset.bid ?? "move");
      }
    };
    const onDragOver = (event: DragEvent) => {
      if (!dragged) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const target = findDropTarget(root, event.clientY, event.target as HTMLElement, dragged);
      if (!target) return;
      root
        .querySelectorAll(".editor-drop-before,.editor-drop-after")
        .forEach((el) => el.classList.remove("editor-drop-before", "editor-drop-after"));
      target.classList.add(
        event.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2
          ? "editor-drop-before"
          : "editor-drop-after",
      );
    };
    const onDrop = (event: DragEvent) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      const target = findDropTarget(root, event.clientY, event.target as HTMLElement, dragged);
      if (!target) {
        root.appendChild(dragged);
        onDragEnd();
        return;
      }
      const after = event.clientY >= target.getBoundingClientRect().top + target.offsetHeight / 2;
      target.parentNode?.insertBefore(dragged, after ? target.nextSibling : target);
      root
        .querySelectorAll(".editor-drop-before,.editor-drop-after")
        .forEach((el) => el.classList.remove("editor-drop-before", "editor-drop-after"));
    };
    const onDragEnd = () => {
      dragged?.classList.remove("editor-dragging");
      root
        .querySelectorAll(".editor-drop-before,.editor-drop-after")
        .forEach((el) => el.classList.remove("editor-drop-before", "editor-drop-after"));
      dragged = null;
    };
    root.addEventListener("dragstart", onDragStart);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("drop", onDrop);
    root.addEventListener("dragend", onDragEnd);
    return () => {
      root.removeEventListener("dragstart", onDragStart);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("drop", onDrop);
      root.removeEventListener("dragend", onDragEnd);
    };
  }, [saveSnapshot, source]);

  useEffect(() => {
    toolRef.current = tool;
    const root = editor.current;
    if (!root) return;
    Array.from(root.children).forEach((child) => {
      const element = child as HTMLElement;
      element.classList.add("editor-movable");
      element.classList.toggle("editor-draggable", tool === "move");
      element.draggable = tool === "move";
    });
    if (tool === "move") window.getSelection()?.removeAllRanges();
  }, [tool]);

  const remember = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.current?.contains(selection.anchorNode))
      range.current = selection.getRangeAt(0).cloneRange();
  };
  const command = (cmd: string, value?: string) => {
    saveSnapshot();
    editor.current?.focus();
    const selection = window.getSelection();
    if (range.current && editor.current?.contains(range.current.commonAncestorContainer)) {
      selection?.removeAllRanges();
      selection?.addRange(range.current);
    }
    document.execCommand(cmd, false, value);
    remember();
  };
  const openGraphEditor = (figure: HTMLElement) => {
    try {
      const spec = JSON.parse(figure.dataset.graphSpec ?? "{}") as GraphSpec;
      setGraphEdit({ figure, spec: { ...spec, legende: spec.legende ?? { x: 3, y: 3 } } });
    } catch {
      toast.error("Les données de ce graphique sont illisibles.");
    }
  };
  const clean = () => {
    const clone = editor.current!.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(".editor-selected")
      .forEach((el) => el.classList.remove("editor-selected"));
    clone.querySelectorAll<HTMLElement>(".editor-movable,.editor-draggable").forEach((element) => {
      element.classList.remove(
        "editor-movable",
        "editor-draggable",
        "editor-dragging",
        "editor-drop-before",
        "editor-drop-after",
      );
      element.removeAttribute("draggable");
    });
    removeDragArtifacts(clone);
    clone.querySelectorAll(".graph-inline-edit").forEach((button) => button.remove());
    clone.removeAttribute("contenteditable");
    return clone;
  };
  const insertFormula = () => {
    try {
      const html = katex.renderToString(formula || "", {
        displayMode: true,
        throwOnError: true,
        output: "html",
      });
      command(
        "insertHTML",
        `<div contenteditable="false" class="editor-formula">${html}</div><p><br></p>`,
      );
      setFormula(null);
    } catch {
      toast.error("La formule LaTeX contient une erreur.");
    }
  };
  const buttons = [
    ["bold", "G", "Gras"],
    ["italic", "I", "Italique"],
    ["underline", "S", "Souligner"],
    ["strikeThrough", "Barré", "Barrer"],
    ["superscript", "x²", "Exposant"],
    ["subscript", "x₂", "Indice"],
    ["justifyLeft", "⇤", "Aligner à gauche"],
    ["justifyCenter", "↔", "Centrer"],
    ["justifyRight", "⇥", "Aligner à droite"],
    ["insertUnorderedList", "•", "Liste à puces"],
    ["insertOrderedList", "1.", "Liste numérotée"],
    ["outdent", "←", "Réduire le retrait"],
    ["indent", "→", "Augmenter le retrait"],
    ["removeFormat", "×", "Effacer la mise en forme"],
  ];
  return (
    <div
      className="visual-editor"
      role="dialog"
      aria-modal="true"
      aria-label="Modifier le document"
    >
      <div className="editor-top">
        <div className="dm-brand">
          <span className="dm-logo">∑</span>Digital <b>Math</b> <span>· Édition</span>
        </div>
        <div className="flex gap-2">
          <button
            disabled={!undoCount}
            onClick={undo}
            title="Annuler la dernière modification (Ctrl+Z)"
          >
            ↶ Revenir en arrière · Ctrl+Z
          </button>
          <button disabled={!redoCount} onClick={redo} title="Rétablir (Ctrl+Y)">
            ↷ Rétablir
          </button>
          <button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              const doc = clean();
              doc.style.cssText = "position:fixed;left:-10000px;width:170mm";
              document.body.append(doc);
              try {
                await printDocument(doc, title, meta, author);
              } catch {
                toast.error("L’export a échoué.");
              } finally {
                doc.remove();
                setExporting(false);
              }
            }}
          >
            Exporter en PDF
          </button>
          <button onClick={() => onClose(clean().innerHTML)}>Terminer</button>
        </div>
      </div>
      <div className="editor-tool-switch" role="toolbar" aria-label="Outil d'édition">
        <button
          type="button"
          aria-pressed={tool === "text"}
          className={tool === "text" ? "active" : ""}
          onClick={() => setTool("text")}
        >
          T Texte
        </button>
        <button
          type="button"
          aria-pressed={tool === "move"}
          className={tool === "move" ? "active" : ""}
          onClick={() => setTool("move")}
        >
          ✋ Main · Déplacer
        </button>
        <span>
          {tool === "text"
            ? "Cliquez dans le document pour modifier le texte."
            : "Saisissez un élément puis déposez-le à la nouvelle position."}
        </span>
      </div>
      <div className="editor-toolbar" role="toolbar" aria-label="Mise en forme">
        <select
          aria-label="Style de paragraphe"
          onChange={(e) => command("formatBlock", e.target.value)}
          defaultValue="p"
        >
          <option value="p">Normal</option>
          <option value="h1">Titre 1</option>
          <option value="h2">Titre 2</option>
          <option value="h3">Titre 3</option>
        </select>
        <select aria-label="Police" onChange={(e) => command("fontName", e.target.value)}>
          <option value="Arial">Sans</option>
          <option value="Georgia">Serif</option>
          <option value="Consolas">Mono</option>
        </select>
        <select
          aria-label="Taille"
          defaultValue="3"
          onChange={(e) => command("fontSize", e.target.value)}
        >
          <option value="2">Petit</option>
          <option value="3">Normal</option>
          <option value="5">Grand</option>
          <option value="6">Très grand</option>
        </select>
        {buttons.map(([cmd, label, name]) => (
          <button
            key={cmd}
            aria-label={name}
            title={name}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command(cmd!)}
          >
            {label}
          </button>
        ))}
        <label>
          Couleur{" "}
          <input
            type="color"
            aria-label="Couleur du texte"
            onChange={(e) => command("foreColor", e.target.value)}
          />
        </label>
        <label>
          Surlignage{" "}
          <input
            type="color"
            defaultValue="#fff275"
            aria-label="Surlignage"
            onChange={(e) => command("hiliteColor", e.target.value)}
          />
        </label>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => setFormula("")}>
          ∑ Formule
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            command(
              "insertHTML",
              "<table><tbody><tr><th>Colonne 1</th><th>Colonne 2</th></tr><tr><td>Valeur</td><td>Valeur</td></tr></tbody></table><p><br></p>",
            )
          }
        >
          Tableau
        </button>
      </div>
      <p className="editor-hint">
        Utilisez Texte pour écrire et Main pour déplacer un paragraphe, un titre, un tableau, une
        formule ou un graphique. Les modifications sont conservées dans cet onglet.
      </p>
      {selected && (
        <div className="editor-toolbar">
          <span>Élément sélectionné</span>
          {selected.matches("figure[data-graph-spec]") ? (
            <button
              onClick={() => openGraphEditor(selected)}
            >
              Modifier le graphique
            </button>
          ) : null}
          <button
            onClick={() => {
              saveSnapshot();
              const before = selected.previousElementSibling;
              if (before) before.before(selected);
            }}
          >
            Monter
          </button>
          <button
            onClick={() => {
              saveSnapshot();
              const after = selected.nextElementSibling;
              if (after) after.after(selected);
            }}
          >
            Descendre
          </button>
          <button
            onClick={() => {
              saveSnapshot();
              selected.remove();
              setSelected(null);
            }}
          >
            Supprimer
          </button>
          <button
            onClick={() => {
              selected.classList.remove("editor-selected");
              setSelected(null);
            }}
          >
            Désélectionner
          </button>
        </div>
      )}
      <div
        ref={editor}
        className="digital-document prose-cahier editor-paper"
        data-document-title={title}
        data-document-meta={meta}
        contentEditable={tool === "text"}
        suppressContentEditableWarning
        role="textbox"
        aria-label="Contenu du document"
        aria-multiline="true"
        onMouseUp={remember}
        onKeyUp={remember}
        onBeforeInput={saveSnapshot}
        onKeyDown={(event) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          const key = event.key.toLowerCase();
          if (key === "z" && !event.shiftKey) {
            event.preventDefault();
            undo();
          } else if (key === "y" || (key === "z" && event.shiftKey)) {
            event.preventDefault();
            redo();
          }
        }}
        onClick={(event) => {
          const editButton = (event.target as HTMLElement).closest(".graph-inline-edit");
          if (editButton) {
            event.preventDefault();
            event.stopPropagation();
            const figure = editButton.closest("figure[data-graph-spec]") as HTMLElement | null;
            if (figure) openGraphEditor(figure);
            return;
          }
          const element = (event.target as HTMLElement).closest(
            "figure, table",
          ) as HTMLElement | null;
          selected?.classList.remove("editor-selected");
          if (element && editor.current?.contains(element)) {
            element.classList.add("editor-selected");
            setSelected(element);
          } else setSelected(null);
        }}
      />
      {formula !== null && (
        <div
          className="math-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Formule scientifique"
        >
          <h2>∑ Formule scientifique</h2>
          <input
            autoFocus
            aria-label="Code LaTeX"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="\\frac{a}{b}"
          />
          <div
            className="math-preview"
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(formula, {
                throwOnError: false,
                displayMode: true,
                output: "html",
              }),
            }}
          />
          <div className="editor-toolbar">
            {[
              "\\frac{a}{b}",
              "\\sqrt{x}",
              "x^{2}",
              "x_{n}",
              "\\int_{a}^{b}",
              "\\sum_{n=1}^{N}",
              "\\pi",
              "\\infty",
            ].map((key) => (
              <button key={key} onClick={() => setFormula(formula + key)}>
                {key}
              </button>
            ))}
          </div>
          <button onClick={insertFormula}>Insérer</button>
          <button onClick={() => setFormula(null)}>Annuler</button>
        </div>
      )}
      {graphEdit && (
        <div className="graph-editor-dialog" role="dialog" aria-modal="true" aria-label="Modifier le graphique">
          <div className="graph-editor-dialog-head"><h2>Modifier le graphique</h2><button onClick={() => setGraphEdit(null)}>Fermer</button></div>
          <p>Modifiez les légendes, les points de passage et le type de chaque tracé.</p>
          <GraphEditorPanel spec={graphEdit.spec} onChange={(spec) => setGraphEdit({ ...graphEdit, spec })} />
          <p className="graph-position-help">Cliquez dans l’aperçu pour déplacer directement la légende.</p>
          <div
            className="graph-editor-preview"
            title="Cliquer pour placer la légende"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100));
              const y = Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100));
              setGraphEdit({ ...graphEdit, spec: { ...graphEdit.spec, legende: { x, y } } });
            }}
          ><img src={graphToDataUrl(graphEdit.spec)} alt="Aperçu du graphique" /></div>
          <div className="graph-editor-actions">
            <button onClick={() => setGraphEdit(null)}>Annuler</button>
            <button className="primary" onClick={() => {
              saveSnapshot();
              const figure = graphEdit.figure;
              const image = figure.querySelector("img") ?? document.createElement("img");
              image.src = graphToDataUrl(graphEdit.spec);
              image.alt = graphEdit.spec.titre || "Graphique";
              image.style.cssText = "max-width:100%;height:auto";
              if (!image.parentElement) figure.prepend(image);
              figure.querySelectorAll(".graph-legend").forEach((legend) => legend.remove());
              let caption = figure.querySelector("figcaption");
              if (graphEdit.spec.titre) {
                caption ??= document.createElement("figcaption");
                caption.textContent = graphEdit.spec.titre;
                if (!caption.parentElement) figure.append(caption);
              } else caption?.remove();
              figure.dataset.graphSpec = JSON.stringify(graphEdit.spec);
              if (!figure.querySelector(".graph-inline-edit")) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "graph-inline-edit";
                button.textContent = "✎ Modifier";
                button.setAttribute("contenteditable", "false");
                button.setAttribute("draggable", "false");
                figure.append(button);
              }
              setGraphEdit(null);
            }}>Appliquer au document</button>
          </div>
        </div>
      )}
    </div>
  );
}

function findDropTarget(
  root: HTMLElement,
  clientY: number,
  eventTarget: HTMLElement,
  dragged: HTMLElement,
): HTMLElement | null {
  const direct = eventTarget.closest(".editor-movable") as HTMLElement | null;
  if (direct && direct.parentElement === root && direct !== dragged) return direct;
  const candidates = Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child !== dragged,
  );
  return (
    candidates.find((candidate) => clientY < candidate.getBoundingClientRect().bottom) ??
    candidates.at(-1) ??
    null
  );
}

function removeDragArtifacts(container: HTMLElement): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    if (node.data.includes("digital-math-block")) {
      node.data = node.data.replace(/(?:digital-math-block\s*)+/g, "");
    }
  });
}
