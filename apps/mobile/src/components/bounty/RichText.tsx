import { Image } from "expo-image";
import { Fragment, type ReactNode } from "react";
import { Linking, View } from "react-native";

import { Text } from "~/components/ui/Text";
import { useColors } from "~/theme/theme";

/**
 * Renders bounty briefs and entries written in wadzz0's rich-text editor.
 *
 * Deliberately a tiny, closed renderer instead of an HTML engine: it knows
 * p/br/strong/b/em/i/u/a/ul/ol/li/h1–h3/img and turns everything else into
 * its text. Nothing is executed, so there's nothing to sanitise away — the
 * web's DOMPurify job is done by never interpreting markup in the first
 * place. Links open only http(s).
 */

type Node = { tag: string; attrs: Record<string, string>; children: Node[] } | string;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") {
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});

const VOID = new Set(["br", "img", "hr"]);

function parse(html: string): Node[] {
  const root: { tag: string; attrs: Record<string, string>; children: Node[] } = { tag: "root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<\/?([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1]!;
    if (m[3] != null) {
      top.children.push(decode(m[3]));
      continue;
    }
    const tag = m[1]!.toLowerCase();
    if (m[0].startsWith("</")) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (m[2] ?? "").matchAll(/([a-z-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi)) attrs[a[1]!.toLowerCase()] = decode(a[3] ?? a[4] ?? "");
    const node = { tag, attrs, children: [] as Node[] };
    top.children.push(node);
    if (!VOID.has(tag) && !m[0].endsWith("/>")) stack.push(node);
  }
  return root.children;
}

export function RichText({ html, className }: { html: string; className?: string }) {
  const { c } = useColors();
  const nodes = parse(html);

  const inline = (n: Node, key: number, style: { bold?: boolean; italic?: boolean; underline?: boolean; link?: string }): ReactNode => {
    if (typeof n === "string") return n;
    const s = { ...style };
    if (n.tag === "strong" || n.tag === "b") s.bold = true;
    if (n.tag === "em" || n.tag === "i") s.italic = true;
    if (n.tag === "u") s.underline = true;
    if (n.tag === "br") return "\n";
    if (n.tag === "a" && /^https?:\/\//i.test(n.attrs.href ?? "")) s.link = n.attrs.href;
    const kids = n.children.map((k, i) => inline(k, i, s));
    if (s.link && n.tag === "a") {
      return (
        <Text key={key} onPress={() => void Linking.openURL(s.link!)} style={{ color: c("ar-green-hot"), textDecorationLine: "underline" }}>
          {kids}
        </Text>
      );
    }
    if (n.tag === "strong" || n.tag === "b" || n.tag === "em" || n.tag === "i" || n.tag === "u") {
      return (
        <Text key={key} style={{ fontWeight: s.bold ? "700" : undefined, fontStyle: s.italic ? "italic" : undefined, textDecorationLine: s.underline ? "underline" : undefined, color: s.bold ? c("ar-text") : undefined }}>
          {kids}
        </Text>
      );
    }
    return <Fragment key={key}>{kids}</Fragment>;
  };

  const block = (n: Node, key: number): ReactNode => {
    if (typeof n === "string") {
      if (!n.trim()) return null;
      return (
        <Text key={key} className="text-[13px] leading-5 text-ar-dim">
          {n}
        </Text>
      );
    }
    switch (n.tag) {
      case "h1":
      case "h2":
      case "h3":
        return (
          <Text key={key} className="font-semibold text-ar-text" style={{ fontSize: n.tag === "h1" ? 16 : 15, marginTop: key ? 6 : 0 }}>
            {n.children.map((k, i) => inline(k, i, {}))}
          </Text>
        );
      case "ul":
      case "ol":
        return (
          <View key={key} style={{ gap: 4 }}>
            {n.children
              .filter((k): k is Exclude<Node, string> => typeof k !== "string" && k.tag === "li")
              .map((li, i) => (
                <View key={i} className="flex-row gap-2 pl-1">
                  <Text className="text-[13px] leading-5 text-ar-faint">{n.tag === "ol" ? `${i + 1}.` : "•"}</Text>
                  <Text className="flex-1 text-[13px] leading-5 text-ar-dim">{li.children.map((k, j) => inline(k, j, {}))}</Text>
                </View>
              ))}
          </View>
        );
      case "img":
        return /^https?:\/\//i.test(n.attrs.src ?? "") ? <Image key={key} source={{ uri: n.attrs.src }} style={{ width: "100%", aspectRatio: 16 / 10, borderRadius: 14 }} contentFit="cover" /> : null;
      case "hr":
        return <View key={key} className="h-px bg-ar-line" />;
      default:
        return (
          <Text key={key} className="text-[13px] leading-5 text-ar-dim">
            {n.children.map((k, i) => inline(k, i, {}))}
          </Text>
        );
    }
  };

  return <View className={className} style={{ gap: 8 }}>{nodes.map(block)}</View>;
}

/** Plain text inside stored HTML — for editing an entry in a text box. */
export function htmlToText(html: string) {
  return decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "")).trim();
}
