import { NextResponse } from 'next/server';
import { getTodayPredictions } from '@/lib/predictions';

export async function GET() {
  try {
    const rows = await getTodayPredictions();
    return NextResponse.json(rows || []);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
