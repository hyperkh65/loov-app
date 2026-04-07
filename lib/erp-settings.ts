import { COMPANY_INFO, DB_SETTINGS, notionQuery, notionCreate, notionUpdate, RT, TITLE, email as EMAIL } from './notion-erp';

export interface CompanySettings {
    name: string;
    ceo: string;
    bizNo: string;
    address: string;
    tel: string;
    fax: string;
    email: string;
    bank: string;
    bankForeign1: string;
    bankForeign2: string;
    logoUrl: string;
    stampUrl: string;
    bizType: string;
    bizItem: string;
}

export const getSettings = (): CompanySettings => {
    const defaults = { ...COMPANY_INFO, bizType: '도소매', bizItem: '전자부품, 조명기구' };
    if (typeof window === 'undefined') return defaults;
    const saved = localStorage.getItem('loov_erp_settings');
    if (saved) {
        try { return { ...defaults, ...JSON.parse(saved) }; } catch (e) { return defaults; }
    }
    return defaults;
};

export const saveSettings = (settings: CompanySettings) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('loov_erp_settings', JSON.stringify(settings));
    }
};

export const fetchCompanySettings = async (): Promise<CompanySettings> => {
    try {
        const res = await notionQuery(DB_SETTINGS());
        if (res.results.length > 0) {
            const p = res.results[0].properties;
            const settings: CompanySettings = {
                name: p.name?.title?.[0]?.plain_text || COMPANY_INFO.name,
                ceo: p.ceo?.rich_text?.[0]?.plain_text || COMPANY_INFO.ceo,
                bizNo: p['business no']?.rich_text?.[0]?.plain_text || COMPANY_INFO.bizNo,
                address: p.address?.rich_text?.[0]?.plain_text || COMPANY_INFO.address,
                tel: p.tel?.rich_text?.[0]?.plain_text || COMPANY_INFO.tel,
                fax: p.fax?.rich_text?.[0]?.plain_text || COMPANY_INFO.fax,
                email: p.email?.email || COMPANY_INFO.email,
                bank: p['account domestic']?.rich_text?.[0]?.plain_text || COMPANY_INFO.bank,
                bankForeign1: p['account overseas 1']?.rich_text?.[0]?.plain_text || COMPANY_INFO.bankForeign1,
                bankForeign2: p['account overseas 2']?.rich_text?.[0]?.plain_text || COMPANY_INFO.bankForeign2,
                logoUrl: p.logo?.url || COMPANY_INFO.logoUrl,
                stampUrl: p.stamp?.url || COMPANY_INFO.stampUrl,
                bizType: p['category 1']?.rich_text?.[0]?.plain_text || '도소매',
                bizItem: p['category 2']?.rich_text?.[0]?.plain_text || '전자부품, 조명기구'
            };
            saveSettings(settings);
            return settings;
        }
    } catch (e) {
        console.error('Failed to fetch settings from Notion:', e);
    }
    return getSettings();
};

export const saveCompanySettingsNotion = async (settings: CompanySettings) => {
    saveSettings(settings);
    try {
        const res = await notionQuery(DB_SETTINGS());

        const props: any = {
            'name': TITLE(settings.name),
            'ceo': RT(settings.ceo),
            'business no': RT(settings.bizNo),
            'address': RT(settings.address),
            'tel': RT(settings.tel),
            'fax': RT(settings.fax),
            'email': EMAIL(settings.email),
            'account domestic': RT(settings.bank),
            'account overseas 1': RT(settings.bankForeign1),
            'account overseas 2': RT(settings.bankForeign2),
            'category 1': RT(settings.bizType),
            'category 2': RT(settings.bizItem)
        };

        if (settings.logoUrl) props['logo'] = { url: settings.logoUrl };
        if (settings.stampUrl) props['stamp'] = { url: settings.stampUrl };

        if (res.results && res.results.length > 0) {
            const pageId = res.results[0].id;
            const updateRes = await notionUpdate(pageId, props);
            if (updateRes.error) throw new Error(updateRes.message || '노션 페이지 업데이트 실패');
            return updateRes;
        } else {
            const createRes = await notionCreate(DB_SETTINGS(), props);
            if (createRes.error) throw new Error(createRes.message || '노션 페이지 생성 실패');
            return createRes;
        }
    } catch (e: any) {
        throw e;
    }
};
