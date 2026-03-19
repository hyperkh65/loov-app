/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client } from '@notionhq/client';
import { nasExecWithStdin, nasExec } from './nas-ssh';

export const NAS_BASE = '/volume1/homes/urjent/loov/notion';

// Extract page ID from URL or ID string (handle dashes)
export function parseNotionPageId(urlOrId: string): string {
  // Match 32 hex chars (no dashes)
  const match = urlOrId.match(/([a-f0-9]{32})/i);
  if (match) {
    const id = match[1];
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  }
  // Already has dashes or it's a UUID
  return urlOrId;
}

// Get plain text from Notion rich_text array
export function richTextToString(richText: any[]): string {
  return (richText || []).map((t: any) => t.plain_text || '').join('');
}

// Delay helper for rate limiting (3 req/s)
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Recursively fetch all block children
export async function fetchBlocksRecursive(
  notion: Client,
  blockId: string,
  depth: number = 0
): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    await delay(350); // rate limit: ~3 req/s
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of res.results as any[]) {
      blocks.push({ ...block, _depth: depth });
      if (block.has_children) {
        const children = await fetchBlocksRecursive(notion, block.id, depth + 1);
        (block as any)._children = children;
        blocks.push(...children);
      }
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return blocks;
}

// Convert block tree to markdown
export function blocksToMarkdown(blocks: any[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const type: string = block.type;
    const data = block[type] || {};
    const indent = '  '.repeat(block._depth || 0);

    switch (type) {
      case 'paragraph': {
        const text = richTextToString(data.rich_text || []);
        lines.push(`${indent}${text}`);
        lines.push('');
        break;
      }
      case 'heading_1': {
        const text = richTextToString(data.rich_text || []);
        lines.push(`# ${text}`);
        lines.push('');
        break;
      }
      case 'heading_2': {
        const text = richTextToString(data.rich_text || []);
        lines.push(`## ${text}`);
        lines.push('');
        break;
      }
      case 'heading_3': {
        const text = richTextToString(data.rich_text || []);
        lines.push(`### ${text}`);
        lines.push('');
        break;
      }
      case 'bulleted_list_item': {
        const text = richTextToString(data.rich_text || []);
        lines.push(`${indent}- ${text}`);
        break;
      }
      case 'numbered_list_item': {
        const text = richTextToString(data.rich_text || []);
        lines.push(`${indent}1. ${text}`);
        break;
      }
      case 'code': {
        const text = richTextToString(data.rich_text || []);
        const lang = data.language || '';
        lines.push('```' + lang);
        lines.push(text);
        lines.push('```');
        lines.push('');
        break;
      }
      case 'quote': {
        const text = richTextToString(data.rich_text || []);
        lines.push(`> ${text}`);
        lines.push('');
        break;
      }
      case 'callout': {
        const text = richTextToString(data.rich_text || []);
        const emoji = data.icon?.emoji || '';
        lines.push(`> ${emoji} ${text}`);
        lines.push('');
        break;
      }
      case 'divider': {
        lines.push('---');
        lines.push('');
        break;
      }
      case 'image': {
        const url =
          data.type === 'external' ? data.external?.url : data.file?.url;
        const caption = richTextToString(data.caption || []);
        lines.push(`![${caption}](${url || ''})`);
        lines.push('');
        break;
      }
      case 'file': {
        const url =
          data.type === 'external' ? data.external?.url : data.file?.url;
        const caption = richTextToString(data.caption || []);
        lines.push(`[${caption || 'file'}](${url || ''})`);
        lines.push('');
        break;
      }
      case 'embed': {
        const url = data.url || '';
        lines.push(`[embed](${url})`);
        lines.push('');
        break;
      }
      case 'table': {
        lines.push('<!-- table -->');
        lines.push('');
        break;
      }
      case 'toggle': {
        const text = richTextToString(data.rich_text || []);
        lines.push(`<details><summary>${text}</summary>`);
        lines.push('');
        lines.push('</details>');
        lines.push('');
        break;
      }
      case 'to_do': {
        const text = richTextToString(data.rich_text || []);
        const checked = data.checked ? 'x' : ' ';
        lines.push(`${indent}- [${checked}] ${text}`);
        break;
      }
      case 'child_database': {
        const title = data.title || 'Database';
        lines.push(`**[Database: ${title}]**`);
        lines.push('');
        break;
      }
      case 'child_page': {
        const title = data.title || 'Page';
        lines.push(`**[Page: ${title}]**`);
        lines.push('');
        break;
      }
      default:
        break;
    }
  }

  return lines.join('\n');
}

// Extract file URLs from blocks
export function extractFileRefs(
  blocks: any[]
): { blockId: string; url: string; type: string }[] {
  const refs: { blockId: string; url: string; type: string }[] = [];

  for (const block of blocks) {
    const type: string = block.type;
    const data = block[type] || {};

    if (type === 'image' || type === 'file' || type === 'pdf' || type === 'video' || type === 'audio') {
      let url = '';
      if (data.type === 'file') {
        url = data.file?.url || '';
      } else if (data.type === 'external') {
        url = data.external?.url || '';
      }
      if (url) {
        refs.push({ blockId: block.id, url, type });
      }
    }
  }

  return refs;
}

// Download file from URL and save to NAS
export async function downloadFileToNas(url: string, nasPath: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());

    // Create parent directory
    const parentDir = nasPath.split('/').slice(0, -1).join('/');
    await nasExec(`mkdir -p "${parentDir}"`);

    // Write file via stdin
    const result = await nasExecWithStdin(
      `python3 -c "import sys; open('${nasPath}','wb').write(sys.stdin.buffer.read())"`,
      buffer
    );
    return result.code === 0;
  } catch {
    return false;
  }
}

// Get page title from page object
export function getPageTitle(page: any): string {
  const props = page.properties || {};
  for (const key of ['Name', 'Title', 'title', 'name']) {
    if (props[key]?.title) return richTextToString(props[key].title);
  }
  // Try any title-type prop
  for (const prop of Object.values(props) as any[]) {
    if (prop.type === 'title' && prop.title) return richTextToString(prop.title);
  }
  return '(제목 없음)';
}

// Get cover URL from page object
export function getPageCover(page: any): string | null {
  if (!page.cover) return null;
  if (page.cover.type === 'external') return page.cover.external?.url || null;
  if (page.cover.type === 'file') return page.cover.file?.url || null;
  return null;
}

// Get icon from page object
export function getPageIcon(page: any): string | null {
  if (!page.icon) return null;
  if (page.icon.type === 'emoji') return page.icon.emoji || null;
  if (page.icon.type === 'external') return page.icon.external?.url || null;
  if (page.icon.type === 'file') return page.icon.file?.url || null;
  return null;
}

// Create Notion client
export function createNotionClient(token: string): Client {
  return new Client({ auth: token });
}

// Get NAS file path for a page file
export function getNasFilePath(pageId: string, url: string): string {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split('/').pop() || 'file';
    // Clean filename
    const cleanFilename = filename.split('?')[0].replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${NAS_BASE}/files/${pageId}/${cleanFilename}`;
  } catch {
    const hash = url.slice(-20).replace(/[^a-zA-Z0-9]/g, '_');
    return `${NAS_BASE}/files/${pageId}/${hash}`;
  }
}
