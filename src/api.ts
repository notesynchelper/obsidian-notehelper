import { Item, ItemFormat, Omnivore } from '@omnivore-app/api'
import { requestUrl } from 'obsidian'
import { getContentApiUrl } from './settings/local-test'
import { LOCAL_TEST_CONFIG } from './settings/local-test'
import { log, logError } from './logger'

export enum HighlightColors {
  Yellow = 'yellow',
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}

interface GetContentResponse {
  data: {
    libraryItemId: string
    downloadUrl: string
    error?: string
  }[]
}

// 本地Mock服务器的搜索响应接口
interface LocalSearchResponse {
  data: {
    search: {
      items: Item[]
      pageInfo: {
        hasNextPage: boolean
        hasPreviousPage: boolean
        startCursor: string
        endCursor: string
        totalCount: number
      }
    }
  }
}

// Omnivore兼容格式的响应接口
interface OmnivoreCompatibleResponse {
  edges: Array<{ node: Item }>
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor: string
    endCursor: string
    totalCount: number
  }
}

const baseUrl = (endpoint: string) => endpoint.replace(/\/api\/graphql$/, '')

// 自定义服务器搜索函数（返回Omnivore兼容格式）
const searchCustomServerItems = async (
  endpoint: string,
  after: number,
  first: number,
  query: string,
  apiKey?: string
): Promise<OmnivoreCompatibleResponse> => {
  const searchQuery = `
    query Search($after: Int, $first: Int, $query: String) {
      search(after: $after, first: $first, query: $query) {
        items {
          id
          title
          author
          content
          originalUrl
          savedAt
          updatedAt
          publishedAt
          description
          siteName
          slug
          image
          pageType
          contentReader
          wordsCount
          readingProgressPercent
          isArchived
          archivedAt
          readAt
          highlights {
            id
            type
            quote
            prefix
            suffix
            patch
            annotation
            createdAt
            updatedAt
            highlightPositionPercent
            shortId
          }
          labels {
            id
            name
            color
            user_id
            created_at
            updated_at
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
          totalCount
        }
      }
    }`

  const variables = {
    after,
    first,
    query,
  }

  const endpointUrl = endpoint

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers['x-api-key'] = apiKey
  }

  const response = await requestUrl({
    url: endpointUrl,
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: searchQuery,
      variables,
    }),
  })

  return response.json
}

// 本地Mock服务器搜索函数
const searchLocalItems = async (
  endpoint: string,
  after: number,
  first: number,
  query: string,
  apiKey?: string
): Promise<LocalSearchResponse> => {
  const searchQuery = `
    query Search($after: Int, $first: Int, $query: String) {
      search(after: $after, first: $first, query: $query) {
        items {
          id
          title
          author
          content
          originalUrl
          savedAt
          updatedAt
          isArchived
          highlights {
            id
            quote
            note
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
          totalCount
        }
      }
    }
  `

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // 如果在本地测试模式且提供了API密钥，则添加认证头
  if (LOCAL_TEST_CONFIG.ENABLE_LOCAL_TEST && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await requestUrl({
    url: endpoint,
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: searchQuery,
      variables: { after, first, query }
    })
  })

  return response.json
}

const getContent = async (
  endpoint: string,
  apiKey: string,
  libraryItemIds: string[],
): Promise<GetContentResponse> => {
  const response = await requestUrl({
    url: getContentApiUrl(endpoint),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ libraryItemIds, format: 'highlightedMarkdown' }),
  })

  return response.json
}

const downloadFromUrl = async (url: string): Promise<string> => {
  try {
    // polling until download is ready or failed
    const response = await requestUrl({
      url,
    })
    return response.text
  } catch (error) {
    // retry after 1 second if download returns 404
    if (error.status === 404) {
      await sleep(1000)
      return downloadFromUrl(url)
    }

    throw error
  }
}

const fetchContentForItems = async (
  endpoint: string,
  apiKey: string,
  items: Item[],
) => {
  const content = await getContent(
    endpoint,
    apiKey,
    items.map((a) => a.id),
  )

  await Promise.allSettled(
    content.data.map(async (c) => {
      if (c.error) {
        logError('Error fetching content', c.error)
        return
      }

      const item = items.find((i) => i.id === c.libraryItemId)
      if (!item) {
        logError('Item not found', c.libraryItemId)
        return
      }

      // timeout if download takes too long
      item.content = await Promise.race([
        downloadFromUrl(c.downloadUrl),
        new Promise<string>(
          (_, reject) => setTimeout(() => reject('Timeout'), 600_000), // 10 minutes
        ),
      ])
    }),
  )
}

export const getItems = async (
  endpoint: string,
  apiKey: string,
  after = 0,
  first = 10,
  updatedAt = '',
  query = '',
  includeContent = false,
  format: ItemFormat = 'html',
): Promise<[Item[], boolean]> => {
  log('🔧 getItems调用参数:', { endpoint, apiKey, after, first, updatedAt, query })

  // 在本地测试模式下，如果用户没有设置API密钥，则使用默认测试密钥
  if (LOCAL_TEST_CONFIG.ENABLE_LOCAL_TEST && (!apiKey || apiKey.trim() === '')) {
    apiKey = LOCAL_TEST_CONFIG.TEST_API_KEY
    log('🔧 本地测试模式：使用默认测试API密钥')
  }

  log('🔧 检查endpoint:', endpoint)
  log('🔧 是否包含obsidian.notebooksyncer.com:', endpoint.includes('obsidian.notebooksyncer.com'))

  // 检查是否是我们的自定义服务器
  if (endpoint.includes('obsidian.notebooksyncer.com')) {
    log('🔧 使用自定义服务器获取数据')

    try {
      const searchQuery = `${updatedAt ? 'updated:' + updatedAt : ''} sort:saved-asc ${query}`.trim()
      const response = await searchCustomServerItems(endpoint, after, first, searchQuery, apiKey)

      log('🔧 自定义服务器响应:', response)
      log('🔧 response.edges:', response.edges)
      log('🔧 response.pageInfo:', response.pageInfo)

      if (!response.edges) {
        logError('🔧 response.edges is undefined, full response:', JSON.stringify(response, null, 2))
        throw new Error('服务器响应格式错误：缺少edges字段')
      }

      const items = response.edges.map((e: any) => e.node)
      const hasNextPage = response.pageInfo.hasNextPage

      log(`🔧 自定义服务器获取到 ${items.length} 篇文章`)
      log(`🔧 includeContent: ${includeContent}`)

      if (includeContent && items.length > 0) {
        log('🔧 自定义服务器跳过内容获取（内容已在GraphQL响应中）')
        // 对于自定义服务器，跳过额外的内容获取，因为内容已经在GraphQL响应中
        // try {
        //   log('🔧 开始获取文章内容...')
        //   await fetchContentForItems(endpoint, apiKey, items)
        //   log('🔧 文章内容获取完成')
        // } catch (error) {
        //   logError('🔧 获取文章内容失败:', error)
        // }
      }

      log('🔧 准备返回数据')
      return [items, hasNextPage]
    } catch (error) {
      logError('自定义服务器连接失败:', error)
      throw error
    }
  }

  // 检查是否为本地测试模式
  if (LOCAL_TEST_CONFIG.ENABLE_LOCAL_TEST) {
    log('🔧 使用本地Mock服务器获取数据')

    try {
      const searchQuery = `${updatedAt ? 'updated:' + updatedAt : ''} sort:saved-asc ${query}`.trim()
      const response = await searchLocalItems(endpoint, after, first, searchQuery, apiKey)

      const items = response.data.search.items
      const hasNextPage = response.data.search.pageInfo.hasNextPage

      if (includeContent && items.length > 0) {
        try {
          await fetchContentForItems(endpoint, apiKey, items)
        } catch (error) {
          logError('Error fetching content from local server', error)
        }
      }

      return [items, hasNextPage]
    } catch (error) {
      logError('本地Mock服务器连接失败:', error)
      throw error
    }
  }
  
  // 原始的Omnivore API调用
  const omnivore = new Omnivore({
    authToken: apiKey,
    baseUrl: baseUrl(endpoint),
    timeoutMs: 10000, // 10 seconds
  })

  const response = await omnivore.items.search({
    after,
    first,
    query: `${updatedAt ? 'updated:' + updatedAt : ''} sort:saved-asc ${query}`,
    includeContent: false,
    format,
  })

  const items = response.edges.map((e) => e.node)
  if (includeContent && items.length > 0) {
    try {
      await fetchContentForItems(endpoint, apiKey, items)
    } catch (error) {
      logError('Error fetching content', error)
    }
  }

  return [items, response.pageInfo.hasNextPage]
}

export const deleteItem = async (
  endpoint: string,
  apiKey: string,
  articleId: string,
) => {
  const omnivore = new Omnivore({
    authToken: apiKey,
    baseUrl: baseUrl(endpoint),
    timeoutMs: 10000, // 10 seconds
  })

  await omnivore.items.delete({ id: articleId })

  return true
}

export const getArticleCount = async (
  endpoint: string,
  apiKey: string,
): Promise<number> => {
  log('🔧 getArticleCount调用参数:', { endpoint, apiKey: apiKey ? '***' : '(空)' })

  // 在本地测试模式下，如果用户没有设置API密钥，则使用默认测试密钥
  if (LOCAL_TEST_CONFIG.ENABLE_LOCAL_TEST && (!apiKey || apiKey.trim() === '')) {
    apiKey = LOCAL_TEST_CONFIG.TEST_API_KEY
    log('🔧 本地测试模式：使用默认测试API密钥')
  }

  try {
    const apiUrl = endpoint.replace('/api/graphql', '/api/stats/article-count')
    log('🔧 请求URL:', apiUrl)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await requestUrl({
      url: apiUrl,
      method: 'GET',
      headers,
    })

    log('🔧 获取文章数量响应:', response.json)
    return response.json.count || 0
  } catch (error) {
    logError('获取文章数量失败:', error)
    throw error
  }
}

export const clearAllArticles = async (
  endpoint: string,
  apiKey: string,
): Promise<{ success: boolean; deletedCount: number; message: string }> => {
  log('🔧 clearAllArticles调用参数:', { endpoint, apiKey: apiKey ? '***' : '(空)' })

  // 在本地测试模式下，如果用户没有设置API密钥，则使用默认测试密钥
  if (LOCAL_TEST_CONFIG.ENABLE_LOCAL_TEST && (!apiKey || apiKey.trim() === '')) {
    apiKey = LOCAL_TEST_CONFIG.TEST_API_KEY
    log('🔧 本地测试模式：使用默认测试API密钥')
  }

  try {
    const apiUrl = endpoint.replace('/api/graphql', '/api/articles/clear')
    log('🔧 请求URL:', apiUrl)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await requestUrl({
      url: apiUrl,
      method: 'DELETE',
      headers,
    })

    log('🔧 清空文章响应:', response.json)
    return response.json
  } catch (error) {
    logError('清空文章失败:', error)
    throw error
  }
}

// VIP 状态接口定义
export interface VipStatus {
  vipType: 'obtrail' | 'obvip' | 'obvvip' | 'none'
  endTime?: string
  isValid: boolean
  displayText: string
}

// 查询 VIP 状态
export const fetchVipStatus = async (apiKey: string): Promise<VipStatus> => {
  log('🔧 fetchVipStatus调用参数:', { apiKey: apiKey ? '***' : '(空)' })

  if (!apiKey || apiKey.trim() === '') {
    return {
      vipType: 'none',
      isValid: false,
      displayText: '请输入密钥',
    }
  }

  try {
    const apiUrl = 'https://obsidian.notebooksyncer.com/user-config'
    log('🔧 请求URL:', apiUrl)

    const response = await requestUrl({
      url: apiUrl,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    })

    log('🔧 VIP状态响应:', response.json)

    if (response.json.success && response.json.data && response.json.data.length > 0) {
      const vipData = response.json.data[0]
      const vipType = vipData.vip_type as 'obtrail' | 'obvip' | 'obvvip'
      const endTime = vipData.endtime

      // 判断是否过期
      const isValid = endTime ? new Date(endTime) > new Date() : false

      // 生成显示文本
      let displayText = ''
      const vipTypeNames = {
        obtrail: '试用会员',
        obvip: '正式会员',
        obvvip: '头等舱会员',
      }

      const typeName = vipTypeNames[vipType] || '未知类型'
      const expiredSuffix = isValid ? '' : '（已过期）'
      const timeStr = endTime
        ? new Date(endTime).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : ''

      displayText = `${typeName}${expiredSuffix} | 到期时间：${timeStr}`

      return {
        vipType,
        endTime,
        isValid,
        displayText,
      }
    } else {
      // 没有VIP信息
      return {
        vipType: 'none',
        isValid: false,
        displayText: '未开通会员',
      }
    }
  } catch (error) {
    logError('查询VIP状态失败:', error)
    return {
      vipType: 'none',
      isValid: false,
      displayText: '查询失败，请检查密钥',
    }
  }
}

// 获取二维码图片 URL - 直接返回 Cloudflare CDN 地址
export const getQrCodeUrl = (type: 'vip' | 'group'): string => {
  return type === 'vip'
    ? 'https://obsidian.notebooksyncer.com/vip.png'
    : 'https://obsidian.notebooksyncer.com/obgroup.png'
}
