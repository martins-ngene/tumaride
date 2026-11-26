import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const filePath = path.join(process.cwd(), 'public/recordings/index.html');
  if (!fs.existsSync(filePath)) {
    return new NextResponse('Proof index not found', { status: 404 });
  }
  const html = fs.readFileSync(filePath, 'utf-8');
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
