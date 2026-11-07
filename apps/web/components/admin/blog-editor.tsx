"use client";

import * as React from "react";
import { usePublicarImagem } from "@/hooks/use-publicar-imagem";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { BlogEditorToolbar } from "./blog-editor-toolbar";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation } from "convex/react";
import { api } from "@workspace/convex/api";

interface BlogEditorProps {
  content?: any;
  onChange: (content: any) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
}

export function BlogEditor({
  content,
  onChange,
  placeholder = "Start writing your blog post...",
  disabled = false,
  className,
  minHeight = "300px",
}: BlogEditorProps) {
  const publicarImagem = usePublicarImagem();
  const getImageUrl = useMutation(api.blogs.getImageUrl);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline hover:text-primary/80",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full h-auto mx-auto my-4",
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: "blog-table" },
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content || "",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }: { editor: any }) => {
      onChange(editor.getJSON());
    },
  });

  React.useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  React.useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;

    try {
      // O URL da CDN fica embutido no texto do artigo, por isso tem de ser já o
      // definitivo — não um do Convex que deixa de existir na limpeza.
      const { url: imageUrl } = await publicarImagem(file);

      if (imageUrl) {
        editor.chain().focus().setImage({ src: imageUrl }).run();
      }
    } catch (error) {
      console.error("Image upload failed:", error);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={cn("border border-border rounded-lg bg-card overflow-hidden", className)}>
      <BlogEditorToolbar editor={editor} onImageUpload={handleImageUpload} />

      <div
        className="prose prose-sm max-w-none p-4 focus-within:outline-none"
        style={{ minHeight }}
      >
        <EditorContent
          editor={editor}
          className={cn(
            "outline-none",
            "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[inherit]",
            "[&_.ProseMirror_p]:my-2 [&_.ProseMirror_p]:leading-relaxed",
            "[&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:mb-3",
            "[&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-2",
            "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ul]:my-2",
            "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_ol]:my-2",
            "[&_.ProseMirror_li]:my-1",
            "[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_blockquote]:my-4",
            "[&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:my-4 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:overflow-hidden [&_.ProseMirror_table]:table-fixed",
            "[&_.ProseMirror_th]:bg-muted [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border [&_.ProseMirror_th]:px-3 [&_.ProseMirror_th]:py-2 [&_.ProseMirror_th]:text-left [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:text-muted-foreground [&_.ProseMirror_th]:text-xs [&_.ProseMirror_th]:uppercase [&_.ProseMirror_th]:tracking-wider [&_.ProseMirror_th]:relative",
            "[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border [&_.ProseMirror_td]:px-3 [&_.ProseMirror_td]:py-2 [&_.ProseMirror_td]:align-top [&_.ProseMirror_td]:relative",
            "[&_.ProseMirror_.selectedCell]:bg-accent",
            "[&_.ProseMirror_.column-resize-handle]:absolute [&_.ProseMirror_.column-resize-handle]:right-[-2px] [&_.ProseMirror_.column-resize-handle]:top-0 [&_.ProseMirror_.column-resize-handle]:bottom-[-2px] [&_.ProseMirror_.column-resize-handle]:w-1 [&_.ProseMirror_.column-resize-handle]:bg-primary [&_.ProseMirror_.column-resize-handle]:pointer-events-none",
            "[&_.ProseMirror.resize-cursor]:cursor-col-resize",
            "[&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
