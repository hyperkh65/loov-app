import { XMLParser } from 'fast-xml-parser';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    let blNo = searchParams.get('blNo');

    if (!blNo) {
        return Response.json({ success: false, error: 'B/L number is required' }, { status: 400 });
    }

    blNo = blNo.trim().toUpperCase();

    const currentYear = new Date().getFullYear();
    const searchYears = [currentYear, currentYear - 1, currentYear - 2];
    const crkyCn = 'r260g286i041p271c040p050q0';

    const parser = new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
        parseTagValue: true,
        removeNSPrefix: true,
    });

    try {
        for (const year of searchYears) {
            const types = ['hblNo', 'mblNo'];
            for (const type of types) {
                const url = `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo?crkyCn=${crkyCn}&${type}=${blNo}&blYy=${year}`;
                const response = await fetch(url, { method: 'GET', cache: 'no-store' });
                const xmlData = await response.text();
                const jObj: any = parser.parse(xmlData);

                const root = jObj?.cargCsclPrgsInfoQryRtnVo;
                const result = root?.cargCsclPrgsInfoQryVo;
                const totalCount = parseInt(root?.tCnt || '0');

                if (totalCount > 0 && result) {
                    let details = root?.cargCsclPrgsInfoDtlQryVo || [];
                    if (!Array.isArray(details)) details = [details];

                    return Response.json({
                        success: true,
                        type: 'IMPORT',
                        data: result,
                        details: details
                    });
                }
            }
        }

        const exportUrl = `https://unipass.customs.go.kr:38010/ext/rest/expDclrNoPrExpFfmnBrkdQry/retrieveExpDclrNoPrExpFfmnBrkd?crkyCn=${crkyCn}&blNo=${blNo}`;
        const expRes = await fetch(exportUrl, { method: 'GET', cache: 'no-store' });
        const expXml = await expRes.text();
        const expObj: any = parser.parse(expXml);

        const expRoot = expObj?.expDclrNoPrExpFfmnBrkdQryRtnVo;
        const expResult = expRoot?.expDclrNoPrExpFfmnBrkdBlNoQryRsltVo;
        const expCount = parseInt(expRoot?.tCnt || '0');

        if (expCount > 0 && expResult) {
            return Response.json({
                success: true,
                type: 'EXPORT',
                data: Array.isArray(expResult) ? expResult[0] : expResult,
                details: []
            });
        }

        return Response.json({ success: false, error: 'No shipment found in UNIPASS.' });
    } catch (error: any) {
        return Response.json({ success: false, error: 'Customs Link Error: ' + error.message }, { status: 500 });
    }
}
