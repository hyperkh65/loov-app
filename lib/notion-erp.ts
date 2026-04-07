export const PROXY = '/api/notion';

export const COMPANY_INFO = {
    name: '(주)와이엔케이글로벌',
    ceo: '김현',
    bizNo: '135-86-53844',
    address: '경기도 용인시 기흥구 흥덕중앙로 120, 흥덕IT밸리 타워동 1202호',
    tel: '031-8066-7440',
    fax: '031-8066-7441',
    email: 'contact@ynkglobal.com',
    bank: '국민은행 123456-78-901234 (예금주: 주식회사 와이엔케이글로벌)\n기업은행 000-000000-00-000 (예금주: 주식회사 와이엔케이글로벌)',
    bankForeign1: 'BANK: SHINHAN BANK / SWIFT CODE: SHBKKRSE',
    bankForeign2: 'ACCOUNT NO: 110-123-456789 / ACCOUNT NAME: YNK GLOBAL CO., LTD.',
    stampUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=STAMP',
    logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=YNK'
};

export const DB_USERS = '26d1f4ff9a0e800cba14e56be989568b';
export const DB_SALES = '26e1f4ff9a0e801f807fde6aa13b12a0';
export const DB_PRODUCTS = '2a01f4ff9a0e8016aa33c239d64eb482';
export const DB_CLIENTS = '2a11f4ff9a0e80c5b431d7ca0194e149';
export const DB_QUOTES = '2a21f4ff9a0e80a5b6b5fd006e46a44a';
export const DB_PURCHASE_ORDERS = '2aa1f4ff9a0e80e792a3d7a68a342917';
export const DB_INVENTORY = '2f81f4ff9a0e804a8cf6e704a77555dd';
export const DB_HR = '2f81f4ff9a0e80bcb86fd05d5065036c';
export const DB_IMPORTS_MASTER = '2af1f4ff9a0e80898f92f5dcd99524f6';
export const DB_IMPORTS_DETAIL = '2ae1f4ff9a0e80b18652c3f9448b59fc';
export const DB_INVOICES = '2f81f4ff9a0e80c69bdaff32bed85b90';
export const DB_INVOICE_DETAIL = '2f81f4ff9a0e80fc8ecafb9b9f38e32b';
export const DB_SCHEDULE = '2f81f4ff9a0e808aadbdee348204eb7c';
export const DB_SETTINGS = '2fa1f4ff9a0e8081b816f06ee2665de5';

/* --------- Field Helpers --------- */
export const rt = (t: string) => ({ rich_text: [{ type: 'text', text: { content: String(t || '') } }] });
export const title = (t: string) => ({ title: [{ type: 'text', text: { content: String(t || '') } }] });
export const dateISO = (i: string) => ({ date: i ? { start: i } : null });
export const select = (n: string) => ({ select: n ? { name: String(n) } : null });
export const num = (n: number | string) => ({ number: (n === '' || n == null) ? null : Number(n) });
export const files = (url: string, name: string = 'Attachment') => ({
    files: url ? [{ type: 'external', name: String(name), external: { url } }] : []
});
export const email = (e: string) => ({ email: e || null });
export const phone = (p: string) => ({ phone_number: p || null });
export const ms = (arr: string[]) => ({ multi_select: (arr || []).map(name => ({ name })) });

export const RT = rt;
export const TITLE = title;
export const FILES = files;
export const MS = ms;

/* --------- Request Wrapper --------- */
async function api(path: string, body: any) {
    const r = await fetch(PROXY + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

/* --------- Exported Notion Ops --------- */
export const notionQuery = async (db: string, body: any = {}) => {
    let results: any[] = [];
    let hasMore = true;
    let nextCursor = undefined;

    while (hasMore) {
        const payload: any = { db, ...body };
        if (nextCursor) {
            payload.start_cursor = nextCursor;
        }

        const res: any = await api('/query', payload);
        if (res.results) {
            results = [...results, ...res.results];
        }

        hasMore = res.has_more;
        nextCursor = res.next_cursor;
    }

    return { results };
};
export const notionCreate = (db: string, properties: any) => api('/create', { db, properties });
export const notionUpdate = (pageId: string, properties: any) => api('/update', { pageId, properties });
export const notionDelete = (pageId: string) => api('/delete', { pageId });

/* --------- Date Check Helper --------- */
export function isWithinCurrentMonth(dateStr: string): boolean {
    if (!dateStr) return true;
    try {
        const now = new Date();
        const target = new Date(dateStr);
        return now.getFullYear() === target.getFullYear() && now.getMonth() === target.getMonth();
    } catch (e) {
        return true;
    }
}

export function validatePeriod(dateStr: string): boolean {
    if (!isWithinCurrentMonth(dateStr)) {
        alert('데이터 수정 및 삭제는 데이터가 생성된 당월(속한 달) 내에서만 가능합니다.\n(현재 달이 아니므로 작업을 수행할 수 없습니다.)');
        return false;
    }
    return true;
}

/* --------- Upload Helper --------- */
export async function uploadFile(file: File): Promise<{ url: string; name: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const r = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });
    if (!r.ok) throw new Error('파일 업로드 실패');
    const data = await r.json();
    return { url: data.secure_url, name: file.name };
}
