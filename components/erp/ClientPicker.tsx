'use client';

import React, { useState, useEffect } from 'react';
import { notionQuery, DB_CLIENTS } from '@/lib/notion-erp';
import Modal from './Modal';

interface Client {
    id: string;
    name: string;
    manager: string;
    phone: string;
    type: string;
}

interface ClientPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (client: Client) => void;
}

export default function ClientPicker({ isOpen, onClose, onSelect }: ClientPickerProps) {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (isOpen) fetchClients();
    }, [isOpen]);

    async function fetchClients() {
        try {
            setLoading(true);
            const res = await notionQuery(DB_CLIENTS());
            const data = res.results.map((r: any) => ({
                id: r.id,
                name: r.properties.ClientName?.title?.[0]?.plain_text || '이름 없음',
                manager: r.properties.Manager?.rich_text?.[0]?.plain_text || '-',
                phone: r.properties.Phone?.phone_number || '-',
                type: r.properties.Type?.select?.name || '일반'
            }));
            setClients(data);
        } catch (e) {
            console.error('거래처 로드 실패:', e);
        } finally {
            setLoading(false);
        }
    }

    const filtered = clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.manager.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="거래처 선택">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input
                    placeholder="거래처명 또는 담당자 검색..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1rem', borderRadius: '8px', color: 'white' }}
                />
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textAlign: 'left' }}>
                                <th style={{ padding: '8px' }}>거래처명</th>
                                <th style={{ padding: '8px' }}>담당자</th>
                                <th style={{ padding: '8px' }}>구분</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>로딩 중...</td></tr>
                            ) : filtered.map(c => (
                                <tr
                                    key={c.id}
                                    onClick={() => { onSelect(c); onClose(); }}
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                >
                                    <td style={{ padding: '10px', fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>{c.name}</td>
                                    <td style={{ padding: '10px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{c.manager}</td>
                                    <td style={{ padding: '10px' }}>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,112,243,0.1)', color: '#0070f3' }}>{c.type}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
}
