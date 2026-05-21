import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    console.error('[get-assembly-token] ASSEMBLYAI_API_KEY is not set')
    return NextResponse.json({ error: 'AssemblyAI API key not configured' }, { status: 500 })
  }

  try {
    // AssemblyAI v3 Streaming API token endpoint (replaces deprecated /v2/realtime/token)
    const url = 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=600'
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
      },
    })

    const body = await response.text()
    if (!response.ok) {
      console.error(`[get-assembly-token] AssemblyAI returned ${response.status}: ${body}`)
      return NextResponse.json(
        { error: `AssemblyAI error (${response.status}): ${body}` },
        { status: response.status }
      )
    }

    const data = JSON.parse(body)
    if (!data.token) {
      console.error('[get-assembly-token] Response missing token field:', body)
      return NextResponse.json({ error: 'No token in AssemblyAI response' }, { status: 500 })
    }

    return NextResponse.json({ token: data.token })
  } catch (error) {
    console.error('[get-assembly-token] Fetch failed:', error)
    return NextResponse.json({ error: `Failed to get token: ${String(error)}` }, { status: 500 })
  }
}
