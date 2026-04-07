import React, { useState } from 'react';
import Modal from './Modal';
import { ProductData } from '@/lib/aiService';
import { Check, X, AlertTriangle, Edit2, Save, Trash } from 'lucide-react';

interface AIResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    results: ProductData[];
    onConfirm: (selectedProducts: ProductData[]) => void;
    confidence: number;
    source: string;
}

export default function AIResultModal({
    isOpen,
    onClose,
    results,
    onConfirm,
    confidence,
    source
}: AIResultModalProps) {
    const [products, setProducts] = useState<ProductData[]>(results);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
        new Set(results.map((_, i) => i))
    );
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<ProductData | null>(null);

    // Update state when results prop changes
    React.useEffect(() => {
        setProducts(results);
        setSelectedIndices(new Set(results.map((_, i) => i)));
    }, [results]);

    const handleToggleSelect = (index: number) => {
        const newSelected = new Set(selectedIndices);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedIndices(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedIndices.size === products.length) {
            setSelectedIndices(new Set());
        } else {
            setSelectedIndices(new Set(products.map((_, i) => i)));
        }
    };

    const handleRemove = (index: number) => {
        const newProducts = products.filter((_, i) => i !== index);
        setProducts(newProducts);
        // Adjust selected indices
        const newSelected = new Set<number>();
        Array.from(selectedIndices).forEach(i => {
            if (i < index) newSelected.add(i);
            if (i > index) newSelected.add(i - 1);
        });
        setSelectedIndices(newSelected);
    };

    const startEdit = (index: number, product: ProductData) => {
        setEditingIndex(index);
        setEditForm({ ...product });
    };

    const saveEdit = () => {
        if (editForm && editingIndex !== null) {
            const newProducts = [...products];
            newProducts[editingIndex] = editForm;
            setProducts(newProducts);
            setEditingIndex(null);
            setEditForm(null);
        }
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditForm(null);
    };

    const handleConfirm = () => {
        const selected = products.filter((_, i) => selectedIndices.has(i));
        onConfirm(selected);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`AI 분석 결과 (${products.length}개 발견)`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '80vh', overflowY: 'auto' }}>

                {/* Header Info */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    fontSize: '0.9rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: source === 'gemini' ? '#0070f3' : '#10a37f',
                            fontSize: '0.75rem',
                            fontWeight: 600
                        }}>
                            {source === 'gemini' ? 'Gemini 2.0' : 'GPT-4o'}
                        </span>
                        <span style={{ color: confidence > 0.8 ? '#00ff88' : '#ffcc00' }}>
                            신뢰도: {Math.round(confidence * 100)}%
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleSelectAll}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#00dfd8',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            {selectedIndices.size === products.length ? '전체 해제' : '전체 선택'}
                        </button>
                    </div>
                </div>

                {/* Products List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {products.map((product, index) => (
                        <div key={index} style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: `1px solid ${selectedIndices.has(index) ? '#0070f3' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: '12px',
                            padding: '1rem',
                            display: 'flex',
                            gap: '1rem',
                            opacity: selectedIndices.has(index) ? 1 : 0.6,
                            transition: 'all 0.2s'
                        }}>
                            {/* Checkbox */}
                            <div
                                onClick={() => handleToggleSelect(index)}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '6px',
                                    border: `2px solid ${selectedIndices.has(index) ? '#0070f3' : 'rgba(255,255,255,0.3)'}`,
                                    background: selectedIndices.has(index) ? '#0070f3' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    marginTop: '4px'
                                }}
                            >
                                {selectedIndices.has(index) && <Check size={16} color="white" />}
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1 }}>
                                {editingIndex === index ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <input
                                            value={editForm?.name}
                                            onChange={e => setEditForm(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                                            placeholder="제품명"
                                            style={inputStyle}
                                        />
                                        <input
                                            value={editForm?.model}
                                            onChange={e => setEditForm(prev => prev ? ({ ...prev, model: e.target.value }) : null)}
                                            placeholder="모델명"
                                            style={inputStyle}
                                        />
                                        <input
                                            value={editForm?.category}
                                            onChange={e => setEditForm(prev => prev ? ({ ...prev, category: e.target.value }) : null)}
                                            placeholder="카테고리"
                                            style={inputStyle}
                                        />
                                        <input
                                            type="number"
                                            value={editForm?.price}
                                            onChange={e => setEditForm(prev => prev ? ({ ...prev, price: Number(e.target.value) }) : null)}
                                            placeholder="가격"
                                            style={inputStyle}
                                        />
                                        <input
                                            value={editForm?.specs}
                                            onChange={e => setEditForm(prev => prev ? ({ ...prev, specs: e.target.value }) : null)}
                                            placeholder="사양"
                                            style={{ ...inputStyle, gridColumn: '1/-1' }}
                                        />
                                        <div style={{ gridColumn: '1/-1', display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                            <button onClick={saveEdit} style={saveBtnStyle}><Save size={14} /> 저장</button>
                                            <button onClick={cancelEdit} style={cancelBtnStyle}><X size={14} /> 취소</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>{product.name}</h4>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => startEdit(index, product)} style={iconBtnStyle}><Edit2 size={16} /></button>
                                                <button onClick={() => handleRemove(index)} style={{ ...iconBtnStyle, color: '#ff3b30' }}><Trash size={16} /></button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                                            <p>모델: {product.model || '-'}</p>
                                            <p>제조: {product.manufacturer || '-'}</p>
                                            <p>분류: {product.category || '-'}</p>
                                            <p>가격: {product.price?.toLocaleString()}원</p>
                                        </div>
                                        {product.specs && (
                                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                                {product.specs}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                    <button
                        onClick={onClose}
                        style={{ ...btnBaseStyle, background: 'rgba(255,255,255,0.1)' }}
                    >
                        취소
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIndices.size === 0}
                        style={{
                            ...btnBaseStyle,
                            background: selectedIndices.size > 0 ? 'linear-gradient(135deg, #0070f3, #00dfd8)' : 'rgba(255,255,255,0.1)',
                            opacity: selectedIndices.size > 0 ? 1 : 0.5,
                            flex: 2
                        }}
                    >
                        선택한 {selectedIndices.size}개 제품 일괄 등록
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// Styles
const inputStyle = {
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '6px',
    padding: '8px',
    color: 'white',
    fontSize: '0.9rem',
    width: '100%'
};

const btnBaseStyle = {
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    color: 'white',
    fontWeight: 600,
    cursor: 'pointer',
    flex: 1
};

const iconBtnStyle = {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    padding: '4px'
};

const saveBtnStyle = {
    background: '#0070f3',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    padding: '6px 12px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
};

const cancelBtnStyle = {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    padding: '6px 12px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
};
