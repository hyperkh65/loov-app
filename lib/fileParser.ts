import * as XLSX from 'xlsx';

export interface ParsedFile {
    text: string;
    images: string[];
    type: string;
}

export async function parseExcel(file: File): Promise<ParsedFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                let allText = '';
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    allText += `\n\n=== Sheet: ${sheetName} ===\n`;
                    jsonData.forEach((row: any) => { allText += row.join('\t') + '\n'; });
                });
                resolve({ text: allText, images: [], type: 'excel' });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsBinaryString(file);
    });
}

export async function parsePDF(file: File): Promise<ParsedFile> {
    return { text: '', images: [], type: 'pdf' };
}

export async function parseImage(file: File): Promise<ParsedFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = (e.target?.result as string).split(',')[1];
            resolve({ text: `[Image file: ${file.name}]`, images: [base64], type: 'image' });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export async function parseCSV(file: File): Promise<ParsedFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ text: e.target?.result as string, images: [], type: 'csv' });
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

export async function parseText(file: File): Promise<ParsedFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ text: e.target?.result as string, images: [], type: 'text' });
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

export async function parseFile(file: File): Promise<ParsedFile> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'xlsx':
        case 'xls':
            return parseExcel(file);
        case 'pdf':
            return parsePDF(file);
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'webp':
            return parseImage(file);
        case 'csv':
            return parseCSV(file);
        case 'txt':
            return parseText(file);
        default:
            throw new Error(`지원하지 않는 파일 형식: ${extension}`);
    }
}

export function validateFile(file: File): { valid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        return { valid: false, error: '파일 크기는 10MB를 초과할 수 없습니다.' };
    }
    if (!file.name.match(/\.(xlsx|xls|pdf|jpg|jpeg|png|gif|webp|csv|txt)$/i)) {
        return { valid: false, error: '지원하지 않는 파일 형식입니다.' };
    }
    return { valid: true };
}
