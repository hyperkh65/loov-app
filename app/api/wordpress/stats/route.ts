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

    const [countRes, catRes, topRes, monthlyRes, commentRes] = await Promise.all([
      wpFetch('/posts?per_page=1&_fields=id'),
      wpFetch('/categories?per_page=50&orderby=count&order=desc&_fields=id,name,count'),
      wpFetch('/posts?per_page=20&orderby=comment_count&order=desc&_fields=id,title,date,link,comment_count,categories,meta'),
      wpFetch(`/posts?per_page=100&orderby=date&order=desc&after=${yearAgo}&_fields=id,date`),
      wpFetch('/comments?per_page=5&orderby=date&order=desc&_fields=id,author_name,content,date,post'),
    ])

    const totalPosts = parseInt(countRes.headers.get('X-WP-Total') || '0')
    const totalPages = parseInt(countRes.headers.get('X-WP-TotalPages') || '1')
    const categories: { id: number; name: string; count: number }[] = catRes.ok ? await catRes.json() : []
    const topPostsRaw: Record<string, unknown>[] = topRes.ok ? await topRes.json() : []
    const recentPosts: { id: number; date: string }[] = monthlyRes.ok ? await monthlyRes.json() : []
    const recentComments: Record<string, unknown>[] = commentRes.ok ? await commentRes.json() : []

    // Check for view data (post-views-counter plugin)
    const hasViewData = topPostsRaw.some(p => {
      const meta = p.meta as Record<string, unknown> | undefined
      return meta && (meta['views-count'] !== undefined || meta['_pvc_posts'] !== undefined)
    })

    // Sort by views if available
    const topPosts = topPostsRaw
      .map(p => {
        const meta = p.meta as Record<string, unknown> | undefined
        const views = meta?.['views-count'] ?? meta?.['_pvc_posts'] ?? null
        return {
          id: p.id as number,
          title: ((p.title as { rendered?: string })?.rendered || String(p.title)).replace(/<[^>]+>/g, ''),
          date: p.date as string,
          link: p.link as string,
          comment_count: p.comment_count as number,
          views: typeof views === 'number' ? views : views ? parseInt(String(views)) : null,
          categories: (p.categories as number[]) || [],
        }
      })
      .sort((a, b) => (hasViewData ? (b.views || 0) - (a.views || 0) : b.comment_count - a.comment_count))

    // Monthly distribution
    const monthly: Record<string, number> = {}
    for (const post of recentPosts) {
      const month = post.date?.slice(0, 7)
      if (month) monthly[month] = (monthly[month] || 0) + 1
    }

    // Total comments from count header
    const totalComments = commentRes.ok ? parseInt(commentRes.headers.get('X-WP-Total') || '0') : 0

    return NextResponse.json({
      site_id: site.id,
      site_name: site.site_name,
      site_url: site.site_url,
      total_posts: totalPosts,
      total_pages: totalPages,
      total_comments: totalComments,
      categories: categories.slice(0, 20),
      top_posts: topPosts,
      monthly,
      has_view_data: hasViewData,
      recent_comments: recentComments.map(c => ({
        id: c.id,
        author: c.author_name,
        content: ((c.content as { rendered?: string })?.rendered || '').replace(/<[^>]+>/g, '').slice(0, 80),
        date: c.date,
        post_id: c.post,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
