import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

/**
 * Supports Markdown directives:
 * :::note ... :::
 * :::warning ... :::
 * :::tip ... :::
 * :::info ... :::
 * :::danger ... :::
 */
export const remarkAdmonitions: Plugin = () => {
  return (tree: any) => {
    visit(tree, (node: any) => {
      if (node.type === "containerDirective" && typeof node.name === "string") {
        const kind = node.name.toLowerCase();
        if (!["note", "warning", "tip", "info", "danger"].includes(kind)) return;

        node.data = node.data || {};
        node.data.hName = "div";
        node.data.hProperties = {
          ...(node.data.hProperties || {}),
          "data-admonition": kind,
        };
      }
    });
  };
};