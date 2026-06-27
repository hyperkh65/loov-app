import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const siteId = req.nextUrl.searchParams.get('site_id')
  if (!siteId) return NextResponse.json({ error: 'site_id 필요' }, { status: 400 })

  const { data: site } = await supabase
    .from('wordpress_sites')
    .select('id, site_name, site_url, wp_username, app_password')
    .eq('id', siteId)
    .eq('user_id', user.id)
    .single()

  if (!site) return NextResponse.json({ error: '사이트 없음' }, { status: 404 })

  const auth = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64')
  const base = site.site_url.replace(/\/$/, '')

  const wpFetch = (path: string) =>
    fetch(`${base}/wp-json/wp/v2${path}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(15000),
    })

  try {
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()

    // Check if post-views-counter plugin is active first
    const pluginCheckRes = await wpFetch('/plugins/post-views-counter/post-views-counter')
    const pluginActive = pluginCheckRes.ok && ((await pluginCheckRes.json().catch(() => ({}))) as Record<string, unknown>)?.status === 'active'

    // If plugin active: fetch top 25 by views (meta); otherwise fetch by date for URL mapping
    const topQuery = pluginActive
      ? '/posts?per_page=25&orderby=meta_value_num&meta_key=_pvc_posts&order=desc&_fields=id,title,date,link,comment_count,categories,meta'
      : '/posts?per_page=100&orderby=date&order=desc&_fields=id,title,date,link,comment_count,categories,meta'

    const [countRes, catRes, topRes, monthlyRes] = await Promise.all([
      wpFetch('/posts?per_page=1&_fields=id'),
      wpFetch('/categories?per_page=50&orderby=count&order=desc&_fields=id,name,count'),
      wpFetch(topQuery),
      wpFetch(`/posts?per_page=100&orderby=date&order=desc&after=${yearAgo}&_fields=id,date`),
    ])

    const totalPosts = parseInt(countRes.headers.get('X-WP-Total') || '0')
    const totalPages = parseInt(countRes.headers.get('X-WP-TotalPages') || '1')
    const categories: { id: number; name: string; count: number }[] = catRes.ok ? await catRes.json() : []
    const topPostsRaw: Record<string, unknown>[] = topRes.ok ? await topRes.json() : []
    const recentPosts: { id: number; date: string }[] = monthlyRes.ok ? await monthlyRes.json() : []

    // Check for view data in meta (post-views-counter plugin fields)
    const hasViewData = pluginActive || topPostsRaw.some(p => {
      const meta = p.meta as Record<string, unknown> | undefined
      return meta && (meta['views-count'] !== undefined || meta['_pvc_posts'] !== undefined)
    })

    const mapPost = (p: Record<string, unknown>) => {
      const meta = p.meta as Record<string, unknown> | undefined
      const views = meta?.['views-count'] ?? meta?.['_pvc_posts'] ?? null
      return {
        id: p.id as number,
        title: ((p.title as { rendered?: string })?.rendered || String(p.title)).replace(/<[^>]+>/g, ''),
        date: p.date as string,
        link: p.link as string,
        comment_count: (p.comment_count as number) || 0,
        views: typeof views === 'number' ? views : views ? parseInt(String(views)) : null,
        categories: (p.categories as number[]) || [],
      }
    }

    const allPosts = topPostsRaw.map(mapPost)
    // Sort: by views desc if plugin active, otherwise keep API order (by date)
    const topPosts = pluginActive
      ? allPosts.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 25)
      : allPosts.slice(0, 100) // return all for URL→title mapping in GSC tab

    // Monthly distribution
    const monthly: Record<string, number> = {}
    for (const post of recentPosts) {
      const month = post.date?.slice(0, 7)
      if (month) monthly[month] = (monthly[month] || 0) + 1
    }

    return NextResponse.json({
      site_id: site.id,
      site_name: site.site_name,
      site_url: site.site_url,
      total_posts: totalPosts,
      total_pages: totalPages,
      categories: categories.slice(0, 20),
      top_posts: topPosts,
      monthly,
      has_view_data: hasViewData,
      plugin_active: pluginActive,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
