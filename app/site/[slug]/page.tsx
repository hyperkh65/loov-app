import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';

interface SiteConfig {
  user_id: string;
  slug: string;
  is_published: boolean;
  theme: string;
  pages: PageBlock[];
}

interface PageBlock {
  id: string;
  type: 'header' | 'hero' | 'about' | 'services' | 'cta' | 'contact' | 'portfolio';
  enabled: boolean;
  content: Record<string, string>;
}

interface CompanySettings {
  company_name?: string;
  slogan?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data: config } = await supabase
    .from('bossai_website_config')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  const { data: settings } = config
    ? await supabase.from('bossai_company_settings').select('*').eq('user_id', config.user_id).single()
    : { data: null };

  return {
    title: settings?.company_name || slug,
    description: settings?.slogan || `${slug} 공식 홈페이지`,
  };
}

// ── 테마별 스타일 ────────────────────────────────────
const THEMES = {
  modern: {
    bg: 'bg-white',
    header: 'bg-white border-b border-gray-100',
    hero: 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white',
    section: 'bg-gray-50',
    card: 'bg-white border border-gray-100 rounded-2xl',
    btn: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    text: 'text-gray-900',
    subtext: 'text-gray-500',
  },
  minimal: {
    bg: 'bg-white',
    header: 'bg-white border-b border-gray-200',
    hero: 'bg-gray-900 text-white',
    section: 'bg-white',
    card: 'bg-gray-50 rounded-xl',
    btn: 'bg-gray-900 hover:bg-gray-700 text-white',
    text: 'text-gray-900',
    subtext: 'text-gray-400',
  },
  bold: {
    bg: 'bg-yellow-50',
    header: 'bg-yellow-400',
    hero: 'bg-black text-yellow-400',
    section: 'bg-yellow-50',
    card: 'bg-white border-2 border-black rounded-none',
    btn: 'bg-black hover:bg-gray-800 text-yellow-400 font-black',
    text: 'text-black',
    subtext: 'text-gray-700',
  },
} as const;

export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: config } = await supabase
    .from('bossai_website_config')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single() as { data: SiteConfig | null };

  if (!config) {
    notFound();
  }

  const { data: settings } = await supabase
    .from('bossai_company_settings')
    .select('*')
    .eq('user_id', config.user_id)
    .single() as { data: CompanySettings | null };

  const theme = THEMES[config.theme as keyof typeof THEMES] || THEMES.modern;
  const companyName = settings?.company_name || slug;
  const slogan = settings?.slogan || '더 나은 내일을 만듭니다';

  // 활성화된 블록만 순서대로 렌더링
  const activeBlocks = (config.pages || []).filter((b: PageBlock) => b.enabled !== false);

  // 기본 블록 (pages가 비어있을 때)
  const defaultBlocks: PageBlock[] = [
    { id: 'hero', type: 'hero', enabled: true, content: {} },
    { id: 'about', type: 'about', enabled: true, content: {} },
    { id: 'services', type: 'services', enabled: true, content: {} },
    { id: 'contact', type: 'contact', enabled: true, content: {} },
  ];

  const blocks = activeBlocks.length > 0 ? activeBlocks : defaultBlocks;

  return (
    <div className={`min-h-screen ${theme.bg} font-sans`}>
      {/* 헤더 */}
      <header className={`${theme.header} px-6 py-4 flex items-center justify-between sticky top-0 z-10`}>
        <div className="font-black text-xl">{companyName}</div>
        <nav className="flex items-center gap-6 text-sm">
          <a href="#about" className={`${theme.subtext} hover:opacity-70 transition-opacity`}>소개</a>
          <a href="#services" className={`${theme.subtext} hover:opacity-70 transition-opacity`}>서비스</a>
          <a href="#contact" className={`${theme.subtext} hover:opacity-70 transition-opacity`}>문의</a>
        </nav>
      </header>

      {blocks.map((block: PageBlock) => {
        const c = block.content || {};

        if (block.type === 'hero') {
          return (
            <section key={block.id} className={`${theme.hero} py-24 px-6 text-center`}>
              <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
                {c.headline || companyName}
              </h1>
              <p className="text-lg md:text-xl opacity-80 max-w-2xl mx-auto mb-10">
                {c.subheadline || slogan}
              </p>
              <a
                href="#contact"
                className={`inline-block px-8 py-4 rounded-xl font-bold text-lg ${
                  config.theme === 'bold' ? 'bg-yellow-400 text-black' : 'bg-white text-indigo-600'
                } hover:opacity-90 transition-opacity`}
              >
                {c.cta || '지금 시작하기'}
              </a>
            </section>
          );
        }

        if (block.type === 'about') {
          return (
            <section key={block.id} id="about" className={`${theme.section} py-20 px-6`}>
              <div className="max-w-4xl mx-auto">
                <h2 className={`text-3xl font-black ${theme.text} mb-4`}>{c.title || '회사 소개'}</h2>
                <p className={`${theme.subtext} text-lg leading-relaxed`}>
                  {c.body || `${companyName}은 최고의 서비스로 고객의 성공을 함께 만들어갑니다. AI 기술을 활용한 혁신적인 솔루션으로 비즈니스의 새로운 가능성을 열어드립니다.`}
                </p>
              </div>
            </section>
          );
        }

        if (block.type === 'services') {
          const services = c.items
            ? JSON.parse(c.items)
            : [
                { icon: '🚀', title: '빠른 실행', desc: '아이디어를 즉시 실행으로 옮깁니다' },
                { icon: '🎯', title: '정확한 전략', desc: '데이터 기반의 맞춤 전략을 제공합니다' },
                { icon: '💡', title: 'AI 자동화', desc: 'AI로 업무 효율을 극대화합니다' },
              ];

          return (
            <section key={block.id} id="services" className={`py-20 px-6 ${theme.bg}`}>
              <div className="max-w-5xl mx-auto">
                <h2 className={`text-3xl font-black ${theme.text} mb-12 text-center`}>{c.title || '서비스'}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {services.map((s: { icon: string; title: string; desc: string }, i: number) => (
                    <div key={i} className={`${theme.card} p-8 text-center`}>
                      <div className="text-4xl mb-4">{s.icon}</div>
                      <h3 className={`font-bold text-lg ${theme.text} mb-2`}>{s.title}</h3>
                      <p className={theme.subtext}>{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        }

        if (block.type === 'cta') {
          return (
            <section key={block.id} className={`${theme.hero} py-20 px-6 text-center`}>
              <h2 className="text-3xl font-black mb-4">{c.headline || '지금 바로 시작하세요'}</h2>
              <p className="opacity-80 mb-8 text-lg">{c.body || '무료 상담을 신청하고 비즈니스의 변화를 경험하세요.'}</p>
              <a href="#contact"
                className={`inline-block px-8 py-4 rounded-xl font-bold ${
                  config.theme === 'bold' ? 'bg-yellow-400 text-black' : 'bg-white text-indigo-600'
                }`}
              >
                {c.btnText || '무료 상담 신청'}
              </a>
            </section>
          );
        }

        if (block.type === 'contact') {
          return (
            <section key={block.id} id="contact" className={`${theme.section} py-20 px-6`}>
              <div className="max-w-2xl mx-auto text-center">
                <h2 className={`text-3xl font-black ${theme.text} mb-8`}>{c.title || '문의하기'}</h2>
                <div className={`${theme.subtext} space-y-3 mb-8`}>
                  {settings?.phone && <div>📞 {settings.phone}</div>}
                  {settings?.email && <div>📧 {settings.email}</div>}
                  {settings?.address && <div>📍 {settings.address}</div>}
                </div>
                <a
                  href={settings?.email ? `mailto:${settings.email}` : '#'}
                  className={`inline-block px-8 py-4 rounded-xl font-bold ${theme.btn} transition-colors`}
                >
                  이메일 문의
                </a>
              </div>
            </section>
          );
        }

        return null;
      })}

      {/* 푸터 */}
      <footer className={`border-t ${theme.section === 'bg-white' ? 'border-gray-100' : 'border-gray-200'} py-10 px-6 text-center`}>
        <div className={`${theme.subtext} text-sm`}>
          © {new Date().getFullYear()} {companyName}. All rights reserved.
          <br />
          <span className="text-xs opacity-60">Powered by LOOV</span>
        </div>
      </footer>
    </div>
  );
}
