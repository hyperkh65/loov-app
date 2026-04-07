'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/erp/Modal';
import {
    notionQuery, notionCreate, notionUpdate, notionDelete,
    isWithinCurrentMonth, validatePeriod,
    DB_HR, RT, TITLE, FILES, uploadFile, select, email, dateISO
} from '@/lib/notion-erp';

export default function HRPage() {
    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
    const [uploading, setUploading] = useState(false);

    const [form, setForm] = useState<any>({
        name: '', employeeId: '', role: '', position: '', dept: '', email: '', joinDate: new Date().toISOString().split('T')[0], avatar: ''
    });

    useEffect(() => {
        fetchEmployees();
    }, []);

    async function fetchEmployees() {
        try {
            setLoading(true);
            const res = await notionQuery(DB_HR(), { sorts: [{ property: '이름', direction: 'ascending' }] });
            setEmployees(res.results);
        } finally {
            setLoading(false);
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploading(true);
            const data = await uploadFile(file);
            setForm({ ...form, avatar: data });
        } catch (err: any) {
            alert('이미지 업로드 실패: ' + (err.message || '알 수 없는 오류'));
        }
        finally { setUploading(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const avatarVal = typeof form.avatar === 'string' ? form.avatar : form.avatar?.url;
            const avatarName = typeof form.avatar === 'string' ? 'ProfilePhoto' : form.avatar?.name;

            const props = {
                '이름': TITLE(form.name),
                'Name': RT(form.name),
                'Position': select(form.position),
                'Department': select(form.dept),
                'email': email(form.email),
                'photo': FILES(avatarVal || '', avatarName),
                'JoinDate': dateISO(form.joinDate),
                'EmployeeID': RT(form.employeeId)
            };

            if (selectedEmp) {
                if (!validatePeriod(form.joinDate)) return;
                await notionUpdate(selectedEmp.id, props);
            } else {
                await notionCreate(DB_HR(), props);
            }

            setIsModalOpen(false);
            fetchEmployees();
            alert('인사 정보가 노션에 저장되었습니다.');
        } catch (err: any) { alert('오류: ' + err.message); }
    };

    const openModal = (emp?: any) => {
        if (emp) {
            setSelectedEmp(emp);
            const p = emp.properties;
            setForm({
                name: p['이름']?.title[0]?.plain_text || '',
                employeeId: p.EmployeeID?.rich_text[0]?.plain_text || '',
                role: p.Role?.rich_text[0]?.plain_text || '',
                position: p.Position?.select?.name || '',
                dept: p.Department?.select?.name || '',
                email: p.email?.email || '',
                joinDate: p.JoinDate?.date?.start || new Date().toISOString().split('T')[0],
                avatar: p.photo?.files[0]?.external?.url || p.photo?.files[0]?.file?.url || ''
            });
        } else {
            setSelectedEmp(null);
            setForm({ name: '', employeeId: '', role: '', position: '', dept: '', email: '', joinDate: new Date().toISOString().split('T')[0], avatar: '' });
        }
        setIsModalOpen(true);
    };

    const getAvatarUrl = (val: any) => (typeof val === 'string' ? val : val?.url);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>인사 관리 (HR)</h2>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>노션 실시간 연동 및 프로필 이미지 관리</p>
                </div>
                <button onClick={() => openModal()} style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '12px', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    + 직원 등록
                </button>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {loading ? (<div>로딩 중...</div>) :
                    employees.map(emp => {
                        const p = emp.properties;
                        const avatar = p.photo?.files[0]?.external?.url || p.photo?.files[0]?.file?.url;
                        return (
                            <div key={emp.id} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '1rem', border: '2px solid rgba(255,255,255,0.1)', fontSize: '2.5rem' }}>
                                    {avatar ? <img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                                </div>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>{p['이름']?.title[0]?.plain_text || '이름 없음'}</h3>
                                <p style={{ fontSize: '0.85rem', color: '#0070f3', marginBottom: '1rem' }}>{p.Position?.select?.name || '직위 미정'} ({p.Department?.select?.name || '부서 미정'})</p>
                                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                                    <button onClick={() => openModal(emp)} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer' }}>✏️</button>
                                    <button onClick={async () => {
                                        const joinDate = p.JoinDate?.date?.start || '';
                                        if (!validatePeriod(joinDate)) return;
                                        if (confirm('삭제하시겠습니까?')) { await notionDelete(emp.id); fetchEmployees(); }
                                    }} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,0,0,0.1)', border: 'none', color: '#ff4d4d', cursor: 'pointer' }}>🗑️</button>
                                </div>
                            </div>
                        );
                    })}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedEmp ? "직원 정보 수정" : "신규 직원 등록"}>
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '3px solid #0070f3', fontSize: '3rem' }}>
                                {getAvatarUrl(form.avatar) ? <img src={getAvatarUrl(form.avatar)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                            </div>
                            <label style={{ position: 'absolute', right: 0, bottom: 0, background: '#0070f3', padding: '6px', borderRadius: '50%', cursor: 'pointer', fontSize: '0.9rem' }}>
                                📤<input type="file" hidden onChange={handleFileUpload} />
                            </label>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <input placeholder="이름 *" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'white' }} />
                        <input placeholder="사번" value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'white' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <select value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'white' }}>
                            <option value="">부서 선택</option>
                            <option value="영업부">영업부</option><option value="개발팀">개발팀</option><option value="경영관리">경영관리</option><option value="물류팀">물류팀</option>
                        </select>
                        <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'white' }}>
                            <option value="">직위 선택</option>
                            <option value="대표이사">대표이사</option><option value="이사">이사</option><option value="부장">부장</option><option value="차장">차장</option><option value="과장">과장</option><option value="팀장">팀장</option><option value="대리">대리</option><option value="사원">사원</option>
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <input placeholder="이메일" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'white' }} />
                        <input placeholder="입사일" type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem', color: 'white', colorScheme: 'dark' }} />
                    </div>
                    <button type="submit" disabled={uploading} style={{ background: 'linear-gradient(135deg, #0070f3, #6c5ce7)', border: 'none', padding: '0.75rem', borderRadius: '12px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>정보 저장</button>
                </form>
            </Modal>
        </div>
    );
}
