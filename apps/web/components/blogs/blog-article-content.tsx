"use client"

import { Link } from "@/i18n/navigation"
import React from "react"
import { slugifyHeading } from "@/lib/blog-toc"

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
}

interface TipTapNode {
  type: string
  attrs?: Record<string, any>
  content?: TipTapNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, any> }>
}

type RichTextBlock = {
  type: "richText"
  node: TipTapNode
}

type ParagraphBlock = {
  type: "paragraph"
  content: string
}

type HeadingBlock = {
  type: "heading"
  content: string
}

type SubheadingBlock = {
  type: "subheading"
  content: string
  numbered?: boolean
  number?: number
}

type ListBlock = {
  type: "list"
  items: string[]
}

type ImageBlock = {
  type: "image"
  src: string
  alt: string
}

type FaqBlock = {
  type: "faq"
  items: { question: string; answer: string }[]
}

export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | SubheadingBlock
  | ListBlock
  | ImageBlock
  | FaqBlock
  | RichTextBlock

interface BlogArticleContentProps {
  blocks: ContentBlock[]
}

function HeadingText({ text }: { text: string }) {
  const idx = text.indexOf(":")
  if (idx === -1) {
    return <>{text}</>
  }
  const head = text.slice(0, idx + 1)
  const accent = text.slice(idx + 1).trim()
  if (!accent) return <>{text}</>
  return (
    <>
      <span>{head}</span>{" "}
      <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={SERIF_FONT}>
        {accent}
      </span>
    </>
  )
}

function inlineNodesText(nodes: TipTapNode[] | undefined): string {
  if (!nodes) return ""
  let out = ""
  for (const n of nodes) {
    if (n.type === "text" && typeof n.text === "string") out += n.text
    else if (n.content) out += inlineNodesText(n.content)
  }
  return out
}

function renderInlineContent(nodes: TipTapNode[] | undefined): React.ReactNode {
  if (!nodes || nodes.length === 0) return null

  return nodes.map((node, index) => {
    if (node.type === "text") {
      let element: React.ReactNode = node.text || ""

      if (node.marks && node.marks.length > 0) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case "bold":
              element = <strong key={`b-${index}`} className="font-semibold text-[var(--lm-text,#fff)]">{element}</strong>
              break
            case "italic":
              element = <em key={`i-${index}`} className="italic">{element}</em>
              break
            case "underline":
              element = <u key={`u-${index}`} className="underline">{element}</u>
              break
            case "strike":
              element = <s key={`s-${index}`} className="line-through">{element}</s>
              break
            case "code":
              element = (
                <code
                  key={`c-${index}`}
                  className="bg-[var(--lm-surface,#1c1c1c)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] px-1.5 py-0.5 text-[13px] font-mono text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                >
                  {element}
                </code>
              )
              break
            case "link":
              if (mark.attrs?.href) {
                element = (
                  <Link
                    key={`l-${index}`}
                    href={mark.attrs.href}
                    target={mark.attrs.target || "_blank"}
                    rel="noopener noreferrer"
                    className="text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] underline underline-offset-2 hover:text-[var(--lm-text,#fff)] transition-colors"
                  >
                    {element}
                  </Link>
                )
              }
              break
          }
        }
      }

      return <React.Fragment key={index}>{element}</React.Fragment>
    }

    if (node.type === "hardBreak") {
      return <br key={index} />
    }

    return null
  })
}

function ParagraphNode({ node }: { node: TipTapNode }) {
  const content = renderInlineContent(node.content)
  if (!content) return null
  return (
    <p className="text-[14px] md:text-[15px] text-[var(--lm-muted,#999)] leading-[28.5px] w-full">
      {content}
    </p>
  )
}

function HeadingAnchor({ id }: { id: string }) {
  return (
    <span
      id={id}
      aria-hidden="true"
      className="block h-0 w-full"
      style={{ scrollMarginTop: 96 }}
    />
  )
}

function HeadingNode({ node, headingId }: { node: TipTapNode; headingId?: string }) {
  const level = node.attrs?.level || 2
  const text = inlineNodesText(node.content)

  if (level <= 2) {
    return (
      <>
        {headingId && <HeadingAnchor id={headingId} />}
        <h2
          id={headingId}
          style={{ ...SERIF_FONT, ...(headingId ? { scrollMarginTop: 96 } : {}) }}
          className="text-[24px] xl:text-[30px] text-[var(--lm-text,#fff)] font-medium leading-[34.5px] w-full pt-[21.3px]"
        >
          <HeadingText text={text} />
        </h2>
      </>
    )
  }

  return (
    <>
      {headingId && <HeadingAnchor id={headingId} />}
      <h3
        id={headingId}
        style={headingId ? { scrollMarginTop: 96 } : undefined}
        className="text-[15px] font-semibold tracking-[0.15px] text-[var(--lm-text,#fff)] leading-[28.5px] w-full pt-[14px]"
      >
        {text}
      </h3>
    </>
  )
}

function GoldBulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-[10px] text-[14px] md:text-[15px] text-[var(--lm-muted,#999)] leading-[28.5px]">
      <span className="mt-[11px] block h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--lm-accent,#C9A96E)]" />
      <span className="flex-1 min-w-0">{children}</span>
    </li>
  )
}

function BulletListNode({ node }: { node: TipTapNode }) {
  return (
    <ul className="flex flex-col gap-[7px] w-full pt-[6px] list-none m-0 p-0">
      {node.content?.map((listItem, index) => (
        <GoldBulletItem key={index}>
          {listItem.content?.map((child, childIndex) => {
            if (child.type === "paragraph") {
              return <span key={childIndex}>{renderInlineContent(child.content)}</span>
            }
            return null
          })}
        </GoldBulletItem>
      ))}
    </ul>
  )
}

function OrderedListNode({ node }: { node: TipTapNode }) {
  return (
    <ol className="flex flex-col gap-[7px] w-full pt-[6px] list-decimal pl-[20px] marker:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
      {node.content?.map((listItem, index) => (
        <li key={index} className="text-[14px] md:text-[15px] text-[var(--lm-muted,#999)] leading-[28.5px] pl-1">
          {listItem.content?.map((child, childIndex) => {
            if (child.type === "paragraph") {
              return <span key={childIndex}>{renderInlineContent(child.content)}</span>
            }
            return null
          })}
        </li>
      ))}
    </ol>
  )
}

function BlockquoteNode({ node }: { node: TipTapNode }) {
  return (
    <blockquote className="bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border-l-[2.4px] border-[var(--lm-accent,#C9A96E)] pl-[24.4px] pr-[22px] py-[18px] w-full">
      {node.content?.map((child, index) => {
        if (child.type === "paragraph") {
          return (
            <p
              key={index}
              className="text-[18px] md:text-[20px] text-[var(--lm-text,#fff)] italic leading-[1.2] md:leading-[31px]"
              style={SERIF_FONT}
            >
              {renderInlineContent(child.content)}
            </p>
          )
        }
        return null
      })}
    </blockquote>
  )
}

function CodeBlockNode({ node }: { node: TipTapNode }) {
  const code = node.content?.map((c) => c.text || "").join("") || ""
  return (
    <pre className="bg-[var(--lm-surface,#141414)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] p-4 overflow-x-auto w-full">
      <code className="text-[13px] font-mono leading-relaxed">{code}</code>
    </pre>
  )
}

function ImageNode({ node }: { node: TipTapNode }) {
  const src = node.attrs?.src
  const alt = node.attrs?.alt || ""
  const title = node.attrs?.title

  if (!src) return null

  return (
    <figure className="w-full">
      <div className="relative w-full h-[240px] md:h-[334px] bg-[var(--lm-surface,#1c1c1c)] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      </div>
      {title && (
        <figcaption className="text-center text-[12px] text-[var(--lm-muted,#696969)] mt-2 italic">
          {title}
        </figcaption>
      )}
    </figure>
  )
}

function HorizontalRuleNode() {
  return <hr className="border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] w-full" />
}

function TableCellContent({ nodes }: { nodes: TipTapNode[] | undefined }) {
  if (!nodes) return null
  return (
    <>
      {nodes.map((para, idx) => {
        if (para.type !== "paragraph") return null
        return (
          <span key={idx} className="block leading-[18px]">
            {renderInlineContent(para.content) || " "}
          </span>
        )
      })}
    </>
  )
}

function TableNode({ node }: { node: TipTapNode }) {
  const rows = node.content ?? []
  return (
    <div className="w-full overflow-x-auto pt-[6.4px] pb-[0.4px]">
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((row, rIdx) => {
            if (row.type !== "tableRow") return null
            return (
              <tr key={rIdx} className="flex w-full">
                {row.content?.map((cell, cIdx) => {
                  const isHeader = cell.type === "tableHeader"
                  const colspan = cell.attrs?.colspan ?? 1
                  const colwidth = cell.attrs?.colwidth as number[] | null | undefined
                  const width = colwidth && colwidth[0] ? `${colwidth[0]}px` : undefined
                  const Tag = isHeader ? "th" : "td"
                  return (
                    <Tag
                      key={cIdx}
                      colSpan={colspan}
                      style={width ? { width } : undefined}
                      className={
                        isHeader
                          ? "flex flex-col items-start bg-[var(--lm-surface,#1c1c1c)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] px-[14.8px] pt-[9.4px] pb-[10.5px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] text-[9px] md:text-[10px] tracking-[1.26px] uppercase font-bold leading-[17.1px] flex-1 min-w-[110px]"
                          : "flex flex-col items-start border border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] px-[14.8px] pt-[9.8px] pb-[11px] text-[12px] text-[var(--lm-muted,#999)] leading-[18px] flex-1 min-w-[110px]"
                      }
                    >
                      <TableCellContent nodes={cell.content} />
                    </Tag>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Id de cada título, decidido antes de renderizar.
 *
 * Era um contador que ia sendo incrementado durante o render dos filhos. Como o
 * React renderiza o mesmo componente mais do que uma vez, a segunda passagem já
 * encontrava os ids tomados e acrescentava "-2": no servidor saía
 * `toc-quem-somos` e no cliente `toc-quem-somos-2`, o que partia a hidratação e
 * os links do índice. A tabela é construída de uma vez e indexada pelo próprio
 * nó, por isso dá sempre o mesmo resultado, seja qual for o número de renders.
 */
type AssignId = (key: object) => string | undefined

/** Mesma ordem e mesma regra do extractTocItems, para os âncoras baterem certo. */
function collectHeadingIds(blocks: ContentBlock[]): AssignId {
  const ids = new Map<object, string>()
  const seen = new Set<string>()

  const take = (raw: string, key: object) => {
    const trimmed = (raw || "").replace(/\s+/g, " ").trim()
    if (!trimmed) return
    const base = slugifyHeading(trimmed)
    let id = base
    let counter = 2
    while (seen.has(id)) id = `${base}-${counter++}`
    seen.add(id)
    ids.set(key, id)
  }

  for (const block of blocks) {
    if (block.type === "richText") {
      // Só o primeiro nível do documento: é o único que o renderer transforma
      // em HeadingNode com id.
      for (const child of block.node.content ?? []) {
        if (child.type === "heading" && (child.attrs?.level || 2) <= 3) {
          take(inlineNodesText(child.content), child)
        }
      }
    } else if (block.type === "heading" || block.type === "subheading") {
      take(block.content, block)
    }
  }

  return (key: object) => ids.get(key)
}

function renderTipTapNode(
  node: TipTapNode,
  index: number,
  assignId: AssignId,
): React.ReactNode {
  switch (node.type) {
    case "paragraph":
      return <ParagraphNode key={index} node={node} />
    case "heading":
      return <HeadingNode key={index} node={node} headingId={assignId(node)} />
    case "bulletList":
      return <BulletListNode key={index} node={node} />
    case "orderedList":
      return <OrderedListNode key={index} node={node} />
    case "blockquote":
      return <BlockquoteNode key={index} node={node} />
    case "codeBlock":
      return <CodeBlockNode key={index} node={node} />
    case "image":
      return <ImageNode key={index} node={node} />
    case "horizontalRule":
      return <HorizontalRuleNode key={index} />
    case "table":
      return <TableNode key={index} node={node} />
    default:
      return null
  }
}

function RichTextRenderer({
  node,
  assignId,
}: {
  node: TipTapNode
  assignId: AssignId
}) {
  if (node.type !== "doc" || !node.content) return null
  return (
    <>
      {node.content.map((child, index) => renderTipTapNode(child, index, assignId))}
    </>
  )
}

function renderBlock(
  block: ContentBlock,
  index: number,
  assignId: AssignId,
) {
  switch (block.type) {
    case "richText":
      return <RichTextRenderer key={index} node={block.node} assignId={assignId} />
    case "paragraph":
      return (
        <p
          key={index}
          className="text-[14px] md:text-[15px] text-[var(--lm-muted,#999)] leading-[28.5px] w-full"
        >
          {block.content}
        </p>
      )
    case "heading": {
      const id = assignId(block)
      return (
        <React.Fragment key={index}>
          {id && <HeadingAnchor id={id} />}
          <h2
            id={id}
            style={{ ...SERIF_FONT, ...(id ? { scrollMarginTop: 96 } : {}) }}
            className="text-[24px] xl:text-[30px] text-[var(--lm-text,#fff)] font-medium leading-[34.5px] w-full pt-[21.3px]"
          >
            <HeadingText text={block.content} />
          </h2>
        </React.Fragment>
      )
    }
    case "subheading": {
      const id = assignId(block)
      return (
        <React.Fragment key={index}>
          {id && <HeadingAnchor id={id} />}
          <h3
            id={id}
            style={id ? { scrollMarginTop: 96 } : undefined}
            className="text-[15px] font-semibold tracking-[0.15px] text-[var(--lm-text,#fff)] leading-[28.5px] w-full pt-[14px]"
          >
            {block.numbered && block.number ? `${block.number}. ` : ""}
            {block.content}
          </h3>
        </React.Fragment>
      )
    }
    case "list":
      return (
        <ul key={index} className="flex flex-col gap-[7px] w-full pt-[6px] list-none m-0 p-0">
          {block.items.map((item, i) => (
            <GoldBulletItem key={i}>{item}</GoldBulletItem>
          ))}
        </ul>
      )
    case "image":
      return (
        <figure key={index} className="w-full">
          <div className="relative w-full h-[240px] md:h-[334px] bg-[var(--lm-surface,#1c1c1c)] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={block.src}
              alt={block.alt}
              className="absolute inset-0 size-full object-cover"
              loading="lazy"
            />
          </div>
        </figure>
      )
    case "faq":
      return (
        <div key={index} className="flex flex-col gap-4 w-full">
          <h3
            className="text-[24px] xl:text-[30px] text-[var(--lm-text,#fff)] font-medium leading-[34.5px] w-full pt-[21.3px]"
            style={SERIF_FONT}
          >
            FAQs
          </h3>
          <dl className="flex flex-col gap-4">
            {block.items.map((item, i) => (
              <div
                key={i}
                className="border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] pt-4"
              >
                <dt className="font-semibold text-[15px] text-[var(--lm-text,#fff)]">{item.question}</dt>
                <dd className="text-[14px] md:text-[15px] text-[var(--lm-muted,#999)] leading-[28.5px] mt-1">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )
    default:
      return null
  }
}

export function BlogArticleContent({ blocks }: BlogArticleContentProps) {
  if (!blocks || blocks.length === 0) {
    return null
  }

  const assignId = collectHeadingIds(blocks)

  return (
    <article className="flex flex-col gap-[14px] items-stretch w-full break-words overflow-hidden">
      {blocks.map((block, index) => renderBlock(block, index, assignId))}
    </article>
  )
}
