/** Notion API 응답 → WordPress HTML 변환 */

interface RichText {
  plain_text: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionBlock = Record<string, any>;

function richTextToHtml(richTexts: RichText[]): string {
  if (!Array.isArray(richTexts)) return '';
  return richTexts.map((rt) => {
    let text = (rt.plain_text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ann = rt.annotations || {};
    if (ann.code) text = `<code>${text}</code>`;
    if (ann.bold) text = `<strong>${text}</strong>`;
    if (ann.italic) text = `<em>${text}</em>`;
    if (ann.strikethrough) text = `<s>${text}</s>`;
    if (ann.underline) text = `<u>${text}</u>`;
    if (rt.href) text = `<a href="${rt.href}">${text}</a>`;
    return text;
  }).join('');
}

export function blocksToHtml(blocks: NotionBlock[]): string {
  if (!Array.isArray(blocks)) return '';
  const parts: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { parts.push('</ul>'); inUl = false; }
    if (inOl) { parts.push('</ol>'); inOl = false; }
  };

  for (const block of blocks) {
    const type: string = block.type || '';
    const data = block[type] || {};
    const rt: RichText[] = data.rich_text || [];

    if (type !== 'bulleted_list_item' && inUl) { parts.push('</ul>'); inUl = false; }
    if (type !== 'numbered_list_item' && inOl) { parts.push('</ol>'); inOl = false; }

    switch (type) {
      case 'paragraph': {
        const html = richTextToHtml(rt);
        parts.push(html ? `<p>${html}</p>` : '<p>&nbsp;</p>');
        break;
      }
      case 'heading_1':
        parts.push(`<h1>${richTextToHtml(rt)}</h1>`);
        break;
      case 'heading_2':
        parts.push(`<h2>${richTextToHtml(rt)}</h2>`);
        break;
      case 'heading_3':
        parts.push(`<h3>${richTextToHtml(rt)}</h3>`);
        break;
      case 'bulleted_list_item':
        if (!inUl) { parts.push('<ul>'); inUl = true; }
        parts.push(`<li>${richTextToHtml(rt)}</li>`);
        break;
      case 'numbered_list_item':
        if (!inOl) { parts.push('<ol>'); inOl = true; }
        parts.push(`<li>${richTextToHtml(rt)}</li>`);
        break;
      case 'quote':
        parts.push(`<blockquote>${richTextToHtml(rt)}</blockquote>`);
        break;
      case 'code': {
        const code = (rt[0]?.plain_text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        parts.push(`<pre><code>${code}</code></pre>`);
        break;
      }
      case 'divider':
        parts.push('<hr>');
        break;
      case 'image': {
        const imgUrl = data.type === 'external' ? data.external?.url : data.file?.url;
        const caption = richTextToHtml(data.caption || []);
        if (imgUrl) parts.push(`<figure><img src="${imgUrl}" alt="${data.caption?.[0]?.plain_text || ''}" />${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`);
        break;
      }
      case 'callout': {
        const icon = data.icon?.emoji || '💡';
        parts.push(`<div class="callout"><span>${icon}</span><div>${richTextToHtml(rt)}</div></div>`);
        break;
      }
      case 'toggle':
        parts.push(`<details><summary>${richTextToHtml(rt)}</summary></details>`);
        break;
      default:
        break;
    }
  }

  closeList();
  return parts.join('\n');
}

/** Notion 페이지 제목 추출 (어떤 property든 title 타입이면 OK) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractTitle(properties: Record<string, any>): string {
  for (const key of Object.keys(properties)) {
    const prop = properties[key];
    if (prop.type === 'title' && prop.title?.length) {
      return prop.title.map((rt: RichText) => rt.plain_text).join('');
    }
  }
  return '(제목 없음)';
}

/** Notion 페이지 상태 추출 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractStatus(properties: Record<string, any>, statusKey?: string): string {
  const keys = statusKey ? [statusKey, '상태', 'Status', 'status'] : ['상태', 'Status', 'status', '발행상태'];
  for (const key of keys) {
    const prop = properties[key];
    if (!prop) continue;
    if (prop.type === 'status') return prop.status?.name || '';
    if (prop.type === 'select') return prop.select?.name || '';
  }
  return '';
}

/** Notion rich_text property → plain text */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractRichText(properties: Record<string, any>, key: string): string {
  const prop = properties[key];
  if (!prop) return '';
  if (prop.type === 'rich_text') return prop.rich_text?.map((rt: RichText) => rt.plain_text).join('') || '';
  return '';
}
