// 딸깍 약관·개인정보처리방침 공용 레이아웃. [ ] 안은 사업자 정보로 채워야 하는 자리다. 판매 전 전문가(법률) 검토를 권한다.
export const OPERATOR = { name: '[상호/성명]', rep: '[대표자]', biz: '[사업자등록번호]', mail: '[문의 이메일]', tel: '[연락처]' };
export const EFFECTIVE = '2026년 11월 1일';

export function LegalPage({ title, sections }: { title: string; sections: { h: string; p: string[] }[] }) {
  return (
    <main className="max-w-2xl mx-auto px-5 py-10 text-[15px] leading-7 text-gray-800">
      <h1 className="text-2xl font-bold mb-1">{title}</h1>
      <p className="text-sm text-gray-500 mb-6">시행일: {EFFECTIVE} · 운영: {OPERATOR.name} · 문의: {OPERATOR.mail}</p>
      {sections.map((s, i) => (
        <section key={i} className="mb-6">
          <h2 className="font-semibold text-lg mb-1">{i + 1}. {s.h}</h2>
          {s.p.map((t, j) => <p key={j} className="mb-1.5">{t}</p>)}
        </section>
      ))}
      <p className="text-xs text-gray-400 mt-10">이 문서의 [ ] 표시는 운영자 정보로 채워야 하는 항목입니다.</p>
    </main>
  );
}
