import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { MarkdownBody } from "./MarkdownBody";
import { MarkdownEditor, type MentionOption } from "./MarkdownEditor";

interface InlineEditorProps {
  value: string;
  onSave: (value: string) => void;
  as?: "h1" | "h2" | "p" | "span";
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  imageUploadHandler?: (file: File) => Promise<string>;
  onAttachFile?: (file: File) => Promise<void>;
  mentions?: MentionOption[];
}

/** Shared padding so display and edit modes occupy the exact same box. */
const pad = "px-1 -mx-1";

export function InlineEditor({
  value,
  onSave,
  as: Tag = "span",
  className,
  placeholder = "Click to edit...",
  multiline = false,
  imageUploadHandler,
  onAttachFile,
  mentions,
}: InlineEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onAttachFileRef = useRef(onAttachFile);
  onAttachFileRef.current = onAttachFile;
  const imageUploadHandlerRef = useRef(imageUploadHandler);
  imageUploadHandlerRef.current = imageUploadHandler;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const autoSize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      if (inputRef.current instanceof HTMLTextAreaElement) {
        autoSize(inputRef.current);
      }
    }
  }, [editing, autoSize]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    if (multiline) {
      return (
        <div className={cn("space-y-2", pad)}>
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            placeholder={placeholder}
            contentClassName={className}
            imageUploadHandler={imageUploadHandler}
            onAttachFile={onAttachFile}
            mentions={mentions}
            onSubmit={commit}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={commit}>
              Save
            </Button>
          </div>
        </div>
      );
    }

    return (
      <textarea
        ref={inputRef}
        value={draft}
        rows={1}
        onChange={(e) => {
          setDraft(e.target.value);
          autoSize(e.target);
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full bg-transparent rounded outline-none resize-none overflow-hidden",
          pad,
          className
        )}
      />
    );
  }

  // Use div instead of Tag when rendering markdown to avoid invalid nesting
  // (e.g. <p> cannot contain the <div>/<p> elements that markdown produces)
  const DisplayTag = value && multiline ? "div" : Tag;

  const canDrop = !!(onAttachFile || imageUploadHandler);

  function handleDisplayDragOver(e: React.DragEvent) {
    if (!canDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleDisplayDragLeave(e: React.DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
      setIsDragOver(false);
    }
  }

  function handleDisplayDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const nonImages = files.filter((f) => !f.type.startsWith("image/"));
    if (nonImages.length === 0) return;
    const attachFn = onAttachFileRef.current;
    const uploadFn = imageUploadHandlerRef.current;
    nonImages.forEach((file) => {
      if (attachFn) {
        attachFn(file).catch(() => {});
      } else if (uploadFn) {
        uploadFn(file).catch(() => {});
      }
    });
  }

  return (
    <DisplayTag
      className={cn(
        "relative cursor-pointer rounded hover:bg-accent/50 transition-colors overflow-hidden",
        isDragOver && "ring-1 ring-primary/60 bg-accent/20",
        pad,
        !value && "text-muted-foreground italic",
        className
      )}
      onClick={() => setEditing(true)}
      onDragOver={canDrop ? handleDisplayDragOver : undefined}
      onDragLeave={canDrop ? handleDisplayDragLeave : undefined}
      onDrop={canDrop ? handleDisplayDrop : undefined}
    >
      {value && multiline ? (
        <MarkdownBody>{value}</MarkdownBody>
      ) : (
        value || placeholder
      )}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded border border-dashed border-primary/80 bg-primary/10 text-xs font-medium text-primary">
          Drop file to attach
        </div>
      )}
    </DisplayTag>
  );
}
