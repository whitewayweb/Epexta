import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import * as wp from "@/modules/wordpress/client";

function textResult(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

const handler = createMcpHandler(
  (server) => {
  server.registerTool(
    "list_posts",
    {
      title: "List WordPress Posts",
      description:
        "List blog posts from the connected WordPress site. Use to check existing posts before creating new ones or to find a post to edit.",
      inputSchema: {
        status: z
          .enum(["publish", "draft", "pending", "any"])
          .optional()
          .describe("Filter by post status. Defaults to any."),
        search: z.string().optional().describe("Optional search keyword."),
        perPage: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ status, search, perPage }) => {
      try {
        const posts = await wp.listPosts({ status, search, perPage });
        return textResult(posts);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "list_categories",
    {
      title: "List Categories",
      description: "List existing categories on the connected WordPress site.",
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(await wp.listCategories());
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "list_tags",
    {
      title: "List Tags",
      description: "List existing tags on the connected WordPress site.",
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(await wp.listTags());
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "create_post",
    {
      title: "Create Blog Post",
      description:
        "Create a new blog post on the connected WordPress site. Categories and tags are matched by name to existing terms, or created if they don't exist yet. Optional SEO title/description are written as Yoast-compatible meta fields (only takes effect if the site has Yoast SEO active with those fields exposed to the REST API). Defaults to draft status so nothing goes live without an explicit publish.",
      inputSchema: {
        title: z.string().describe("Post title."),
        contentHtml: z
          .string()
          .describe(
            "Full post body as HTML (e.g. <p>, <h2>, <ul> tags). Do not include the title."
          ),
        status: z
          .enum(["draft", "publish", "pending"])
          .default("draft")
          .describe("Post status. Defaults to draft."),
        excerpt: z.string().optional(),
        categoryNames: z
          .array(z.string())
          .optional()
          .describe("Category names. Created automatically if new."),
        tagNames: z
          .array(z.string())
          .optional()
          .describe("Tag names. Created automatically if new."),
        seoTitle: z
          .string()
          .optional()
          .describe("SEO title (meta title), separate from the on-page title."),
        seoDescription: z
          .string()
          .optional()
          .describe("SEO meta description, ideally under 160 characters."),
        slug: z.string().optional().describe("Custom URL slug."),
      },
    },
    async (input) => {
      try {
        const post = await wp.createPost(input);
        return textResult(post);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "update_post",
    {
      title: "Update Blog Post",
      description:
        "Update fields on an existing post: content, categories, tags, SEO meta, slug, or status. Only fields provided are changed.",
      inputSchema: {
        postId: z.number().int(),
        title: z.string().optional(),
        contentHtml: z.string().optional(),
        status: z.enum(["draft", "publish", "pending"]).optional(),
        excerpt: z.string().optional(),
        categoryNames: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(),
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),
        slug: z.string().optional(),
      },
    },
    async ({ postId, ...fields }) => {
      try {
        const post = await wp.updatePost(postId, fields);
        return textResult(post);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "publish_post",
    {
      title: "Publish Post",
      description: "Change an existing post's status to published.",
      inputSchema: {
        postId: z.number().int(),
      },
    },
    async ({ postId }) => {
      try {
        const post = await wp.publishPost(postId);
        return textResult(post);
      } catch (e) {
        return errorResult(e);
      }
    }
  );

  server.registerTool(
    "set_featured_image",
    {
      title: "Set Featured Image",
      description:
        "Upload an image and set it as a post's featured image. Provide either imageUrl (a URL to fetch, e.g. one ChatGPT already generated and hosted) or imageBase64 with mimeType (raw image data). Exactly one of imageUrl or imageBase64 must be given.",
      inputSchema: {
        postId: z.number().int(),
        imageUrl: z.string().url().optional(),
        imageBase64: z.string().optional(),
        mimeType: z
          .string()
          .optional()
          .describe("Required if imageBase64 is used, e.g. image/png"),
        filename: z.string().default("featured-image.png"),
        altText: z.string().optional(),
      },
    },
    async ({ postId, imageUrl, imageBase64, mimeType, filename, altText }) => {
      try {
        if (!imageUrl && !imageBase64) {
          throw new Error("Provide either imageUrl or imageBase64.");
        }
        if (imageUrl && imageBase64) {
          throw new Error("Provide only one of imageUrl or imageBase64, not both.");
        }

        const media = imageUrl
          ? await wp.uploadMediaFromUrl(imageUrl, filename, altText)
          : await wp.uploadMediaFromBase64(
              imageBase64!,
              filename,
              mimeType ?? "image/png",
              altText
            );

        const post = await wp.setFeaturedImage(postId, media.id);
        return textResult({ media, post });
      } catch (e) {
        return errorResult(e);
      }
    }
  );
  },
  {},
  { basePath: "/api/wordpress", maxDuration: 60 }
);

export { handler as GET, handler as POST };
