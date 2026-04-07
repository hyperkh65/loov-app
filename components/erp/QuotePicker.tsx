'use client';

import React, { useState, useEffect } from 'react';
import { notionQuery, DB_QUOTES } from '@/lib/notion-erp';
import Modal from './Modal';

interface QuotePickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (quote: any) => void;
}

export default function QuotePicker({ isOpen, onClose, onSelect }: QuotePickerProps) {
    const [quotes, setQuotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (isOpen) fetchQuotes();
    }, [isOpen]);

    const fetchQuotes = async () => {
        try {
            setLoading(true);
            const res = await notionQuery(DB_QUOTES, {
                sorts: [{ property: 'Date', direction: 'descending' }]
            });

            const grouped: { [key: string]: any } = {};
            res.results.forEach((r: any) => {
                const props = r.properties;
                const no = props.EstimateNo1?.title?.[0]?.plain_text || props.EstimateNo?.rich_text?.[0]?.plain_text || 'Unknown';
                if (!grouped[no]) {
                    grouped[no] = {
                        no,
                        date: props.Date?.date?.start || '-',
                        client: props.Client?.rich_text?.[0]?.plain_text || props.Client?.title?.[0]?.plain_text || '-',
                        currency: props.Currency?.rich_text?.[0]?.plain_text || props.Currency?.select?.name || 'KRW',
                        items: []
                    };
                }
                grouped[no].items.push({
                    product: props.Product?.rich_text?.[0]?.plain_text || '-',
                    description: props.Description?.rich_text?.[0]?.plain_text || '',
                    voltage: props.Voltage?.rich_text?.[0]?.plain_text || '-',
                    watts: props.Watts?.rich_text?.[0]?.plain_text || '-',
                    unit: props.Unit?.select?.name || 'PCS',
                    qty: props.Qty?.number || 0,
                });
            });

            setQuotes(Object.values(grouped));
        } catch (e) {
            console.error('견적 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    };

    const filtered = quotes.filter(q =>
        q.no.toLowerCase().includes(search.toLowerCase()) ||
        q.client.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="견적 불러오기" size="lg">
            <div>
                <input
                    placeholder="견적번호 또는 업체명으로 검색..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 1rem', color: 'white', marginBottom: '1rem' }}
                />
                <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)' }}>견적 데이터를 불러오는 중...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)' }}>검색 결과가 없습니다.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#1a1a1a' }}>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'left' }}>
                                    <th style={{ padding: '12px' }}>날짜</th>
                                    <th style={{ padding: '12px' }}>견적번호</th>
                                    <th style={{ padding: '12px' }}>거래처</th>
                                    <th style={{ padding: '12px', textAlign: 'right' }}>품목</th>
                                    <th style={{ padding: '12px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((q, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '12px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{q.date}</td>
                                        <td style={{ padding: '12px', fontWeight: 700, color: '#fff' }}>{q.no}</td>
                                        <td style={{ padding: '12px', fontSize: '0.9rem', color: '#fff' }}>{q.client}</td>
                                        <td style={{ padding: '12px', textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>{q.items.length}개</td>
                                        <td style={{ padding: '12px' }}>
                                            <button
                                                onClick={() => { onSelect(q); onClose(); }}
                                                style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                불러오기
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </Modal>
    );
}
