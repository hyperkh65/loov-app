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

    // Detect PVC via WP REST index namespaces (no admin capability required)
    const wpIndexRes = await fetch(`${base}/wp-json/`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10000),
    })
    let pluginActive = false
    if (wpIndexRes.ok) {
      const idx = await wpIndexRes.json().catch(() => ({}))
      pluginActive = Array.isArray(idx?.namespaces) && idx.namespaces.includes('post-views-counter')
    }
    // Fallback: admin plugin endpoint
    if (!pluginActive) {
      const pluginCheckRes = await wpFetch('/plugins/post-views-counter/post-views-counter')
      pluginActive = pluginCheckRes.ok &&
        ((await pluginCheckRes.json().catch(() => ({}))) as Record<string, unknown>)?.status === 'active'
    }

    const [countRes, catRes, topRes, monthlyRes] = await Promise.all([
      wpFetch('/posts?per_page=1&_fields=id'),
      wpFetch('/categories?per_page=50&orderby=count&order=desc&_fields=id,name,count'),
      wpFetch('/posts?per_page=100&orderby=date&order=desc&_fields=id,title,date,link,categories'),
      wpFetch(`/posts?per_page=100&orderby=date&order=desc&after=${yearAgo}&_fields=id,date`),
    ])

    const totalPosts = parseInt(countRes.headers.get('X-WP-Total') || '0')
    const totalPages = parseInt(countRes.headers.get('X-WP-TotalPages') || '1')
    const categories: { id: number; name: string; count: number }[] = catRes.ok ? await catRes.json() : []
    const topPostsRaw: Record<string, unknown>[] = topRes.ok ? await topRes.json() : []
    const recentPosts: { id: number; date: string }[] = monthlyRes.ok ? await monthlyRes.json() : []

    // Get PVC view counts via batch API: /wp-json/post-views-counter/get-post-views/{ids}
    let viewMap: Record<number, number> = {}
    if (pluginActive && topPostsRaw.length > 0) {
      const ids = topPostsRaw.map(p => p.id).join(',')
      const pvcRes = await fetch(`${base}/wp-json/post-views-counter/get-post-views/${ids}`, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(10000),
      })
      if (pvcRes.ok) {
        const pvcData = await pvcRes.json().catch(() => ({}))
        // PVC returns { post_views: { "id": count, ... } } or flat object
        const raw = pvcData?.post_views ?? pvcData
        if (raw && typeof raw === 'object') {
          for (const [k, v] of Object.entries(raw)) {
            viewMap[parseInt(k)] = typeof v === 'number' ? v : parseInt(String(v)) || 0
          }
        }
      }
    }

    const mapPost = (p: Record<string, unknown>) => ({
      id: p.id as number,
      title: ((p.title as { rendered?: string })?.rendered || String(p.title)).replace(/<[^>]+>/g, ''),
      date: p.date as string,
      link: p.link as string,
      comment_count: 0,
      views: pluginActive ? (viewMap[p.id as number] ?? 0) : null,
      categories: (p.categories as number[]) || [],
    })

    const allPosts = topPostsRaw.map(mapPost)
    const topPosts = pluginActive
      ? allPosts.sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 25)
      : allPosts

    const hasViewData = pluginActive && topPosts.some(p => (p.views ?? 0) > 0)

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
