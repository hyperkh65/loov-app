import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const level = searchParams.get('level');

    let query = supabase
      .from('bossai_courses')
      .select('*')
      .eq('is_public', true)
      .order('enrolled_count', { ascending: false });

    if (level && level !== '전체') {
      query = query.eq('level', level);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 현재 사용자 수강 상태도 포함
    const { data: { user } } = await supabase.auth.getUser();
    let enrollments: string[] = [];
    if (user && data) {
      const { data: enrollData } = await supabase
        .from('bossai_course_enrollments')
        .select('course_id')
        .eq('user_id', user.id);
      enrollments = enrollData?.map((e) => e.course_id) || [];
    }

    const courses = (data || []).map((c) => ({
      ...c,
      isEnrolled: enrollments.includes(c.id),
    }));

    return NextResponse.json({ courses });
  } catch (error) {
    console.error('Courses GET error:', error);
    return NextResponse.json({ courses: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { courseId } = body;

    if (!courseId) return NextResponse.json({ error: 'courseId 필요' }, { status: 400 });

    // 수강 신청
    const { data, error } = await supabase
      .from('bossai_course_enrollments')
      .upsert({ user_id: user.id, course_id: courseId, progress: 0 })
      .select()
      .single();

    if (error) throw error;

    // 수강생 수 증가
    const { data: course } = await supabase.from('bossai_courses').select('enrolled_count').eq('id', courseId).single();
    await supabase.from('bossai_courses').update({ enrolled_count: ((course?.enrolled_count as number) || 0) + 1 }).eq('id', courseId);

    return NextResponse.json({ enrollment: data });
  } catch (error) {
    console.error('Courses POST error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
