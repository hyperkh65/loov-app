import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const currencies = ['USD', 'CNY'];
        const results: any = {};

        for (const codes of currencies) {
            const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=${codes}&to=KRW`);
            if (res.ok) {
                const data = await res.json();
                results[codes] = data.rates.KRW;
            } else {
                results[codes] = codes === 'USD' ? 1450 : 200;
            }
        }

        const history: any = {};
        const today = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(today.getFullYear() - 1);
        const startStr = oneYearAgo.toISOString().split('T')[0];

        for (const code of currencies) {
            const res = await fetch(`https://api.frankfurter.dev/v1/${startStr}..?from=${code}&to=KRW`);
            if (res.ok) {
                const data = await res.json();
                history[code] = Object.entries(data.rates).map(([date, rates]: any) => ({
                    date,
                    value: rates.KRW
                }));
            }
        }

        return NextResponse.json({
            rates: results,
            history: history,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
