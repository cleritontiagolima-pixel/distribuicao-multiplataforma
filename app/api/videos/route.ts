import { NextResponse } from 'next/server'
import { Innertube, UniversalCache } from 'youtubei.js'

const INSTANCES = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be']
const PIPED_INSTANCES = ['https://pipedapi.kavin.rocks', 'https://pipedapi.reallyaweso.me']
let clientPromise: Promise<Innertube> | undefined
const getClient = () => clientPromise ??= Innertube.create({ cache: new UniversalCache(false) })

function text(value: any) { return typeof value === 'string' ? value : value?.toString?.() ?? '' }
function normalize(video: any) {
  const id = video.id ?? video.video_id ?? video.videoId
  return { id, title: text(video.title) || 'Vídeo sem título', channel: text(video.author?.name ?? video.author ?? video.uploaderName ?? video.uploaderUrl) || 'Canal desconhecido', views: Number(video.view_count ?? video.viewCount ?? 0) > 0 ? Number(video.view_count ?? video.viewCount).toLocaleString('pt-BR') : '', time: text(video.published_text ?? video.publishedText), duration: Number(video.length_seconds ?? video.lengthSeconds ?? 0), image: video.thumbnails?.[video.thumbnails.length - 1]?.url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, description: text(video.description), sourceUrl: id ? `https://www.youtube.com/watch?v=${id}` : undefined }
}

async function piped(path: string) {
  let last: unknown
  for (const instance of PIPED_INSTANCES) try {
    const response = await fetch(`${instance}${path}`, { signal: AbortSignal.timeout(7000), cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('json')) throw new Error('Resposta inválida')
    return await response.json()
  } catch (error) { last = error }
  throw last instanceof Error ? last : new Error('Piped indisponível')
}

async function invidious(path: string) {
  let last: unknown
  for (const instance of INSTANCES) try {
    const response = await fetch(`${instance}${path}`, { signal: AbortSignal.timeout(7000), cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('json')) throw new Error('Resposta inválida')
    return await response.json()
  } catch (error) { last = error }
  throw last instanceof Error ? last : new Error('Invidious indisponível')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url); const query = searchParams.get('q')?.trim(); const id = searchParams.get('id')?.trim(); const pageNumber = Math.max(1, Number(searchParams.get('page') ?? '1') || 1); const continuation = searchParams.get('continuation')?.trim()
  if (!query && !id && !continuation) return NextResponse.json({ error: 'Informe q ou id.' }, { status: 400 })
  try {
    const client = await getClient()
    if (query || continuation) {
      let page: any = await client.search(query ?? '', { type: 'video' })
      for (let current = 1; current < pageNumber; current += 1) {
        if (!page.has_continuation) break
        page = await page.getContinuation()
      }
      const videos = (page.results ?? []).filter((item: any) => item.type === 'Video' || item.video_id || item.id).map(normalize).filter((item: VideoShape) => item.id)
      return NextResponse.json({ source: 'YouTube Local API', videos, page: pageNumber, hasMore: Boolean(page.has_continuation) })
    }
    const info: any = await client.getBasicInfo(id!)
    const formats = info.streaming_data?.formats ?? []
    const stream = formats.filter((format: any) => format.url && format.has_video).sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]
    if (!stream?.url) throw new Error('Local API não forneceu um stream reproduzível')
    return NextResponse.json({ source: 'YouTube Local API', video: { ...normalize(info.basic_info), description: text(info.basic_info?.short_description), streamUrl: stream.url } })
  } catch (localError) {
    try {
      const data = await invidious(id ? `/api/v1/videos/${encodeURIComponent(id)}` : `/api/v1/search?q=${encodeURIComponent(query!)}&type=video&page=1`)
      if (id) {
        const formats = [...(data.formatStreams ?? []), ...(data.adaptiveFormats ?? [])].filter((format: any) => format.url && format.type?.startsWith('video/')).sort((a: any, b: any) => (b.resolution ?? '').localeCompare(a.resolution ?? ''))
        return NextResponse.json({ source: 'Invidious', video: { ...data, ...normalize(data), streamUrl: formats[0]?.url ?? null } })
      }
      return NextResponse.json({ source: 'Invidious', videos: data.map(normalize).filter((item: VideoShape) => item.id) })
    } catch (fallbackError) {
      try {
        const data = await piped(id ? `/streams/${encodeURIComponent(id)}` : `/search?q=${encodeURIComponent(query!)}&filter=videos`)
        if (id) return NextResponse.json({ source: 'Piped', video: { ...normalize(data), description: text(data.description), streamUrl: data.hls || (data.videoStreams?.filter((stream: any) => stream.videoOnly === false && stream.url).sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null) } })
        return NextResponse.json({ source: 'Piped', videos: (data ?? []).map(normalize).filter((item: VideoShape) => item.id) })
      } catch (pipedError) {
        if (id) {
          return NextResponse.json({ source: 'YouTube Embed', video: { id, title: 'Vídeo do YouTube', image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, channel: 'YouTube', streamUrl: null, embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0` } })
        }
        return NextResponse.json({ error: 'Não foi possível pesquisar agora. As fontes públicas estão temporariamente indisponíveis.' }, { status: 503 })
      }
    }
  }
}

type VideoShape = { id?: string }
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
