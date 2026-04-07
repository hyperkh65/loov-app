'use client';

export function printElement(title: string, contentHtml: string) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('팝업 차단을 해제해주세요.');

    printWindow.document.write(`
        <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: 'Pretendard', sans-serif; padding: 40px; color: #333; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #f8f9fa; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; }
                    .footer { margin-top: 50px; text-align: center; font-size: 0.9rem; color: #666; }
                    .total-section { margin-top: 30px; text-align: right; font-size: 1.2rem; font-weight: bold; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                ${contentHtml}
                <script>window.onload = () => { window.print(); };</script>
            </body>
        </html>
    `);
    printWindow.document.close();
}
