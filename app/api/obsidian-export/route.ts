import { NextRequest, NextResponse } from 'next/server';

// Obsidian Vault 마크다운 형식으로 데이터 내보내기
// (이 API는 서버사이드에서 로컬 스토리지 직접 접근 불가 → 클라이언트에서 POST로 데이터 전송)
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const {
      companySettings,
      employees,
      directives,
      salesLeads,
      accountingEntries,
      marketingCampaigns,
      scheduleEvents,
      projects,
      dailyReports,
    } = data;

    const now = new Date().toISOString().slice(0, 10);

    let md = `---
title: BOSS.AI 백업
date: ${now}
tags: [bossai, backup, 1인기업]
---

# BOSS.AI 데이터 백업
> 생성일: ${new Date().toLocaleString('ko-KR')}

---

## 🏢 회사 정보

| 항목 | 내용 |
|------|------|
| 회사명 | ${companySettings?.companyName || '-'} |
| 대표자 | ${companySettings?.ceoName || '-'} |
| 업종 | ${companySettings?.industry || '-'} |
| 슬로건 | ${companySettings?.slogan || '-'} |
| 웹사이트 | ${companySettings?.website || '-'} |

---

## 👥 AI 직원 목록

${(employees || []).map((emp: { name: string; role: string; department: string; status: string; skills: string[] }) => `### ${emp.name} (${emp.role})
- **부서**: ${emp.department}
- **상태**: ${emp.status}
- **역량**: ${(emp.skills || []).join(', ')}
`).join('\n')}

---

## 📊 영업 파이프라인

${(salesLeads || []).map((lead: { companyName: string; contactName: string; status: string; value: number; notes: string }) => `### ${lead.companyName}
- **담당자**: ${lead.contactName || '-'}
- **현황**: ${lead.status}
- **금액**: ₩${(lead.value || 0).toLocaleString()}
- **메모**: ${lead.notes || '-'}
`).join('\n')}

---

## 💰 회계 내역

### 수입
${(accountingEntries || []).filter((e: { type: string }) => e.type === 'income').map((e: { date: string; category: string; description: string; amount: number }) => `- [${e.date}] ${e.category} / ${e.description}: +₩${(e.amount || 0).toLocaleString()}`).join('\n') || '없음'}

### 지출
${(accountingEntries || []).filter((e: { type: string }) => e.type === 'expense').map((e: { date: string; category: string; description: string; amount: number }) => `- [${e.date}] ${e.category} / ${e.description}: -₩${(e.amount || 0).toLocaleString()}`).join('\n') || '없음'}

---

## 📣 마케팅 캠페인

${(marketingCampaigns || []).map((c: { name: string; platform: string; status: string; startDate: string; budget: number; content: string }) => `### ${c.name}
- **플랫폼**: ${c.platform}
- **상태**: ${c.status}
- **시작일**: ${c.startDate}
- **예산**: ${c.budget ? `₩${c.budget.toLocaleString()}` : '미설정'}
- **내용**: ${c.content || '-'}
`).join('\n')}

---

## 📅 스케줄

${(scheduleEvents || []).sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)).map((e: { date: string; time: string; title: string; type: string; description: string }) => `- [${e.date}${e.time ? ' ' + e.time : ''}] **${e.title}** (${e.type}) ${e.description ? '— ' + e.description : ''}`).join('\n') || '없음'}

---

## 📋 대표 지시사항

${(directives || []).map((d: { priority: string; status: string; title: string; content: string; createdAt: string; deadline: string }) => `### [${d.priority.toUpperCase()}] ${d.title || d.content.slice(0, 30)}
- **상태**: ${d.status}
- **내용**: ${d.content}
- **작성일**: ${d.createdAt ? new Date(d.createdAt).toLocaleDateString('ko-KR') : '-'}
- **마감**: ${d.deadline || '미설정'}
`).join('\n')}

---

## 📁 프로젝트

${(projects || []).map((p: { name: string; status: string; description: string }) => `### ${p.name}
- **상태**: ${p.status}
- **설명**: ${p.description || '-'}
`).join('\n')}

---

## 📋 일일 보고서

${(dailyReports || []).slice(0, 10).map((r: { date: string; content: string }) => `### ${r.date}
${r.content}
`).join('\n')}

---
*BOSS.AI에서 내보낸 백업 파일 · ${new Date().toLocaleString('ko-KR')}*
`;

    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="bossai-backup-${now}.md"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

// GET: 사용법 안내
export async function GET() {
  return NextResponse.json({
    info: 'POST /api/obsidian-export with your store data to get a markdown file',
    usage: 'Send POST request with JSON body containing: companySettings, employees, directives, salesLeads, accountingEntries, marketingCampaigns, scheduleEvents, projects, dailyReports',
  });
}
